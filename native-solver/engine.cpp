/*
 * KaimPLE Native FEM Engine — Complete Pipeline
 * ==============================================================
 * Full pipeline stress analysis solver matching PLE4Win approach:
 *   1. Element subdivision (PIPE_EL/BEND_EL, HDD detection)
 *   2. Soil spring interpolation for sub-nodes
 *   3. Direct sparse K-matrix assembly (never dense)
 *   4. Load vector (thermal + pressure + gravity)
 *   5. Subside (prescribed displacements)
 *   6. Soil springs (consistent Winkler + bilinear iteration)
 *   7. Support springs
 *   8. Boundary conditions (fixed/guided/spring/INFIN Hetényi)
 *   9. Tee SIF calculation
 *  10. Sparse direct solve (Eigen SparseLU)
 *  11. Bilinear soil iteration loop (max 20 iterations)
 *  12. Element force recovery
 *  13. Stress calculation (beam + 48-pt ring model)
 *  14. Unity check (NEN 3650 / EN 13941)
 *
 * Build: node-gyp rebuild
 */

#include <napi.h>
#include <Eigen/Sparse>
#include <Eigen/SparseLU>
#include <vector>
#include <cmath>
#include <string>
#include <unordered_map>
#include <chrono>
#include <algorithm>

using SpMat = Eigen::SparseMatrix<double, Eigen::ColMajor>;
using Triplet = Eigen::Triplet<double>;
using Vec = Eigen::VectorXd;

static constexpr double PI_VAL = 3.14159265358979323846;
static constexpr int RING_N_POINTS = 48;
static constexpr int MAX_SOIL_ITER = 20;
static constexpr double SOIL_TOL = 0.001;

// ═══════════════════════════════════════════════════════════════
// Data structures
// ═══════════════════════════════════════════════════════════════

struct Node {
    std::string id;
    double x, y, z, D, t, DPE;
    int origIdx; // -1 for interpolated sub-nodes
};

struct Element {
    int n1, n2;
    double d, t, dc, R;
    std::string type;
    double pipeEl, bendEl;
};

struct MatProps {
    double E, poisson, alpha, SMYS, density;
};

struct PerElMat {
    double E, poisson, alpha, SMYS, density;
    bool valid;
};

struct LoadCase {
    double gloadF, pressF, tDifF, deadwF, setlF, nodalF;
};

struct BC {
    std::string nodeId, type;
    double kx, ky, kz, krx, kry, krz;
    double soilKh, soilKv, soilKaxial;
};

struct SoilSpring {
    std::string nodeId;
    double kh, kv_up, kv_down, kAxial;
    double rMaxSide, rMaxDown, rMaxUp;
    std::string curveType; // "bilinear" or "tanh"
};

struct Support {
    std::string nodeId, type;
    double kx, ky, kz, krx, kry, krz;
};

struct Subside {
    std::string nodeId;
    double subzMax, uncF, length;
};

struct TeeSpec {
    std::string id;
    double dRun, tRun, dBrn, tBrn, te;
    std::string type;
};

struct GeomSection {
    double As, I, J, W, Ab, ro, ri, rm;
};

// ═══════════════════════════════════════════════════════════════
// Geometry + stress helpers
// ═══════════════════════════════════════════════════════════════

GeomSection calcGeom(double D, double tw) {
    double Di = D - 2*tw, ro = D/2, ri = Di/2, rm = (ro+ri)/2;
    double As = PI_VAL * (ro*ro - ri*ri);
    double I = (PI_VAL/64.0) * (std::pow(D,4) - std::pow(Di,4));
    return {As, I, 2*I, I/ro, PI_VAL*ri*ri, ro, ri, rm};
}

double calcBendSIF(double D, double tw, double R) {
    if (R<=0||tw<=0) return 1.0;
    double h = tw*R / (D/2*D/2);
    return h>0 ? std::max(0.9/std::pow(h, 2.0/3.0), 1.0) : 1.0;
}

double calcBendFlex(double D, double tw, double R, double Pi=0, double E=210000) {
    if (R<=0||tw<=0) return 1.0;
    double rm=(D-tw)/2, h=tw*R/(rm*rm);
    if (h<=0) return 1.0;
    double kf = 1.65/h;
    if (Pi>0 && E>0) {
        double pF = Pi*rm/(E*tw);
        kf *= 1.0/(1.0+6.0*pF*std::pow(1.0/h, 4.0/3.0));
    }
    return std::max(kf, 1.0);
}

void calcTeeSIF(double dR, double tR, double dB, double tB, const std::string& ttype, double te,
                double& sifRun, double& sifBrn) {
    double T = (ttype=="WELD"||ttype=="Welded") ? tR : std::max(tR, te);
    double r2 = dR/2-tR;
    double h = (T/r2)*std::pow(r2/(dR/2), 2);
    sifRun = std::max(0.9/std::pow(std::max(h,0.01), 2.0/3.0), 1.0);
    double r2b = dB/2-tB;
    double hb = (tB/r2b)*std::pow(r2b/(dB/2), 2);
    sifBrn = std::max(0.9/std::pow(std::max(hb,0.01), 2.0/3.0), 1.0);
}

double vonMises(double sh, double sl, double tau=0) {
    return std::sqrt(sh*sh - sh*sl + sl*sl + 3*tau*tau);
}

// ═══════════════════════════════════════════════════════════════
// 12×12 matrices
// ═══════════════════════════════════════════════════════════════

struct M12 { double d[144]; double& operator()(int i,int j){return d[i*12+j];} };

M12 buildLocalK(double E, double G, double A, double Iy, double Iz, double J,
                double L, double nu, double flex=1.0) {
    M12 K; std::fill_n(K.d,144,0.0);
    double psf=1.0/(1.0-nu*nu), EA_L=E*A/L, GJ_L=G*J/L;
    double L2=L*L, L3=L2*L;
    K(0,0)=EA_L; K(0,6)=-EA_L; K(6,0)=-EA_L; K(6,6)=EA_L;
    double EIz=E*Iz*flex*psf;
    double a1=12*EIz/L3,a2=6*EIz/L2,a3=4*EIz/L,a4=2*EIz/L;
    K(1,1)=a1;K(1,5)=a2;K(1,7)=-a1;K(1,11)=a2;
    K(5,1)=a2;K(5,5)=a3;K(5,7)=-a2;K(5,11)=a4;
    K(7,1)=-a1;K(7,5)=-a2;K(7,7)=a1;K(7,11)=-a2;
    K(11,1)=a2;K(11,5)=a4;K(11,7)=-a2;K(11,11)=a3;
    double EIy=E*Iy*flex*psf;
    double b1=12*EIy/L3,b2=6*EIy/L2,b3=4*EIy/L,b4=2*EIy/L;
    K(2,2)=b1;K(2,4)=-b2;K(2,8)=-b1;K(2,10)=-b2;
    K(4,2)=-b2;K(4,4)=b3;K(4,8)=b2;K(4,10)=b4;
    K(8,2)=-b1;K(8,4)=b2;K(8,8)=b1;K(8,10)=b2;
    K(10,2)=-b2;K(10,4)=b4;K(10,8)=b2;K(10,10)=b3;
    K(3,3)=GJ_L;K(3,9)=-GJ_L;K(9,3)=-GJ_L;K(9,9)=GJ_L;
    return K;
}

M12 buildT(double x1,double y1,double z1,double x2,double y2,double z2) {
    M12 T; std::fill_n(T.d,144,0.0);
    double dx=x2-x1,dy=y2-y1,dz=z2-z1;
    double L=std::sqrt(dx*dx+dy*dy+dz*dz);
    if(L<1e-10){for(int i=0;i<12;i++)T(i,i)=1;return T;}
    double lx=dx/L,ly=dy/L,lz=dz/L;
    double rx=0,ry=0,rz=1; if(std::abs(lz)>0.95){rx=1;rz=0;}
    double yx=ry*lz-rz*ly,yy=rz*lx-rx*lz,yz=rx*ly-ry*lx;
    double yL=std::sqrt(yx*yx+yy*yy+yz*yz);
    if(yL>1e-10){yx/=yL;yy/=yL;yz/=yL;}
    double zx=ly*yz-lz*yy,zy=lz*yx-lx*yz,zz=lx*yy-ly*yx;
    double R[9]={lx,ly,lz,yx,yy,yz,zx,zy,zz};
    for(int b=0;b<4;b++)for(int i=0;i<3;i++)for(int j=0;j<3;j++)T(b*3+i,b*3+j)=R[i*3+j];
    return T;
}

void TtKT(const M12& T, const M12& Kl, double* out) {
    double tmp[144];
    for(int i=0;i<12;i++)for(int j=0;j<12;j++){double s=0;for(int k=0;k<12;k++)s+=Kl.d[i*12+k]*T.d[k*12+j];tmp[i*12+j]=s;}
    for(int i=0;i<12;i++)for(int j=0;j<12;j++){double s=0;for(int k=0;k<12;k++)s+=T.d[k*12+i]*tmp[k*12+j];out[i*12+j]=s;}
}

// ═══════════════════════════════════════════════════════════════
// Sparse assembler
// ═══════════════════════════════════════════════════════════════

class SpAsm {
    int n_; std::vector<Triplet> t_;
public:
    SpAsm(int n):n_(n){t_.reserve(n*30);}
    void add(int i,int j,double v){if(std::abs(v)>1e-30)t_.emplace_back(i,j,v);}
    void addEl(const double*Ke,const int*dm){
        for(int i=0;i<12;i++)for(int j=0;j<12;j++){double v=Ke[i*12+j];if(std::abs(v)>1e-30)t_.emplace_back(dm[i],dm[j],v);}
    }
    SpMat build(){SpMat A(n_,n_);A.setFromTriplets(t_.begin(),t_.end());A.makeCompressed();return A;}
    int nnz()const{return(int)t_.size();}
    void clear(){t_.clear();t_.reserve(n_*30);}
};

// ═══════════════════════════════════════════════════════════════
// INFIN boundary (Hetényi half-infinite beam)
// ═══════════════════════════════════════════════════════════════

struct InfinSprings { double kx,ky,kz,krx,kry,krz,k_cross; };

InfinSprings calcInfin(double E, double I, double A, double D, double DPE,
                       double sKh, double sKv, double sKax) {
    double k_lat=(sKh+sKv)/2, k_bed=k_lat*DPE;
    double beta=std::pow(k_bed/(4*E*I), 0.25);
    double EI=E*I;
    double k_trans=2*EI*beta*beta*beta;
    double k_rot=2*EI*beta;
    double k_ax_pm=sKax*PI_VAL*DPE;
    double k_axial=std::sqrt(E*A*k_ax_pm);
    double k_cross=2*EI*beta*beta;
    return {k_axial, k_trans, k_trans, k_rot*0.5, k_rot, k_rot, k_cross};
}

// ═══════════════════════════════════════════════════════════════
// N-API helper to read objects
// ═══════════════════════════════════════════════════════════════

double getNum(Napi::Object& o, const char* k, double def=0) {
    return o.Has(k)&&!o.Get(k).IsUndefined()&&!o.Get(k).IsNull() ? o.Get(k).As<Napi::Number>().DoubleValue() : def;
}
std::string getStr(Napi::Object& o, const char* k, const char* def="") {
    return o.Has(k)&&o.Get(k).IsString() ? o.Get(k).As<Napi::String>().Utf8Value() : std::string(def);
}

// ═══════════════════════════════════════════════════════════════
// MAIN SOLVE
// ═══════════════════════════════════════════════════════════════

Napi::Value Solve(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto t0 = std::chrono::high_resolution_clock::now();
    if(!info[0].IsObject()){Napi::TypeError::New(env,"Expected object").ThrowAsJavaScriptException();return env.Null();}
    auto inp = info[0].As<Napi::Object>();

    // ─── Parse nodes ───
    auto nA=inp.Get("nodes").As<Napi::Array>(); int nN0=nA.Length();
    std::vector<Node> nodes(nN0);
    for(int i=0;i<nN0;i++){auto n=nA.Get(i).As<Napi::Object>();
        nodes[i]={getStr(n,"id"),getNum(n,"x"),getNum(n,"y"),getNum(n,"z"),
                  getNum(n,"D",139.7),getNum(n,"t",3.6),getNum(n,"DPE",nodes[i].D*1.6),i};}
    // Fix DPE default (needs D first)
    for(auto&n:nodes)if(n.DPE<1)n.DPE=n.D*1.6;

    // ─── Parse elements ───
    auto eA=inp.Get("elements").As<Napi::Array>(); int nE0=eA.Length();
    std::vector<Element> elems(nE0);
    for(int i=0;i<nE0;i++){auto e=eA.Get(i).As<Napi::Object>();
        elems[i]={(int)getNum(e,"n1"),(int)getNum(e,"n2"),getNum(e,"d",139.7),getNum(e,"t",3.6),
                  getNum(e,"dc"),getNum(e,"R"),getStr(e,"type","straight"),getNum(e,"pipeEl"),getNum(e,"bendEl")};}

    // ─── Parse material ───
    auto mO=inp.Get("mat").As<Napi::Object>();
    MatProps mat={getNum(mO,"E",210000),getNum(mO,"poisson",0.3),getNum(mO,"alpha",1.2e-5),
                  getNum(mO,"SMYS",235),getNum(mO,"density",7850)};

    // ─── Parse per-element materials ───
    std::unordered_map<int,PerElMat> perElMat;
    if(inp.Has("perElementMaterials")&&inp.Get("perElementMaterials").IsArray()){
        auto pA=inp.Get("perElementMaterials").As<Napi::Array>();
        for(uint32_t i=0;i<pA.Length();i++){auto p=pA.Get(i).As<Napi::Object>();
            int idx=(int)getNum(p,"index",-1);if(idx>=0)
            perElMat[idx]={getNum(p,"E",mat.E),getNum(p,"poisson",mat.poisson),getNum(p,"alpha",mat.alpha),
                           getNum(p,"SMYS",mat.SMYS),getNum(p,"density",mat.density),true};}
    }

    // ─── Parse load case ───
    auto lO=inp.Get("loadCase").As<Napi::Object>();
    LoadCase lc={getNum(lO,"gloadF",1),getNum(lO,"pressF",1),getNum(lO,"tDifF",1),
                 getNum(lO,"deadwF",1),getNum(lO,"setlF",1),getNum(lO,"nodalF")};
    double Pi_bar=getNum(inp,"Pi_bar"),Toper=getNum(inp,"Toper",20),Tinstall=getNum(inp,"Tinstall",10);
    double dF=getNum(inp,"designFactor",0.72),gM=getNum(inp,"gammaM",1.1),wF=getNum(inp,"weldFactor",1.0);
    double Pi=Pi_bar*0.1;

    // ─── Parse BCs, soil springs, supports, subside, tees ───
    std::vector<BC> bcs; std::vector<SoilSpring> soilSpr; std::vector<Support> sups; std::vector<Subside> subs;
    std::unordered_map<std::string,TeeSpec> teeSpecs;
    std::unordered_map<std::string,std::string> teeNodeMap;

    if(inp.Has("boundaryConditions")&&inp.Get("boundaryConditions").IsArray()){
        auto a=inp.Get("boundaryConditions").As<Napi::Array>();
        for(uint32_t i=0;i<a.Length();i++){auto b=a.Get(i).As<Napi::Object>();
            bcs.push_back({getStr(b,"nodeId"),getStr(b,"type","fixed"),getNum(b,"kx"),getNum(b,"ky"),getNum(b,"kz"),
                           getNum(b,"krx"),getNum(b,"kry"),getNum(b,"krz"),getNum(b,"soilKh"),getNum(b,"soilKv"),getNum(b,"soilKaxial")});}}

    if(inp.Has("soilSprings")&&inp.Get("soilSprings").IsArray()){
        auto a=inp.Get("soilSprings").As<Napi::Array>();
        for(uint32_t i=0;i<a.Length();i++){auto s=a.Get(i).As<Napi::Object>();
            soilSpr.push_back({getStr(s,"nodeId"),getNum(s,"kh"),getNum(s,"kv_up"),getNum(s,"kv_down"),getNum(s,"kAxial"),
                               getNum(s,"rMaxSide"),getNum(s,"rMaxDown"),getNum(s,"rMaxUp"),getStr(s,"curveType","bilinear")});}}

    if(inp.Has("supportSprings")&&inp.Get("supportSprings").IsArray()){
        auto a=inp.Get("supportSprings").As<Napi::Array>();
        for(uint32_t i=0;i<a.Length();i++){auto s=a.Get(i).As<Napi::Object>();
            sups.push_back({getStr(s,"nodeId"),getStr(s,"type","fixed"),getNum(s,"kx"),getNum(s,"ky"),getNum(s,"kz"),
                            getNum(s,"krx"),getNum(s,"kry"),getNum(s,"krz")});}}

    if(inp.Has("subsideMap")&&inp.Get("subsideMap").IsObject()){
        auto sm=inp.Get("subsideMap").As<Napi::Object>();
        auto keys=sm.GetPropertyNames();
        for(uint32_t i=0;i<keys.Length();i++){auto k=keys.Get(i).As<Napi::String>().Utf8Value();
            auto v=sm.Get(k).As<Napi::Object>();
            subs.push_back({k,getNum(v,"subzMax"),getNum(v,"uncF",1),getNum(v,"length",1000)});}}

    if(inp.Has("teeSpecs")&&inp.Get("teeSpecs").IsObject()){
        auto ts=inp.Get("teeSpecs").As<Napi::Object>();auto keys=ts.GetPropertyNames();
        for(uint32_t i=0;i<keys.Length();i++){auto k=keys.Get(i).As<Napi::String>().Utf8Value();
            auto v=ts.Get(k).As<Napi::Object>();
            teeSpecs[k]={k,getNum(v,"dRun"),getNum(v,"tRun"),getNum(v,"dBrn"),getNum(v,"tBrn"),getNum(v,"te"),getStr(v,"type","WELD")};}}

    if(inp.Has("teeNodeMap")&&inp.Get("teeNodeMap").IsObject()){
        auto tm=inp.Get("teeNodeMap").As<Napi::Object>();auto keys=tm.GetPropertyNames();
        for(uint32_t i=0;i<keys.Length();i++){auto k=keys.Get(i).As<Napi::String>().Utf8Value();
            teeNodeMap[k]=tm.Get(k).As<Napi::String>().Utf8Value();}}

    auto t_parse=std::chrono::high_resolution_clock::now();

    // ═══════════════════════════════════════════════════════════
    // STEP 1: Element subdivision
    // ═══════════════════════════════════════════════════════════
    std::vector<Node> wN=nodes; std::vector<Element> wE; std::vector<int> sub2orig;
    for(int i=0;i<nN0;i++)sub2orig.push_back(i);

    for(int ei=0;ei<nE0;ei++){
        auto&el=elems[ei]; auto&n1=nodes[el.n1]; auto&n2=nodes[el.n2];
        double dx=n2.x-n1.x,dy=n2.y-n1.y,dz=n2.z-n1.z,L=std::sqrt(dx*dx+dy*dy+dz*dz);
        bool isHDD=el.R>5000&&L>10000, isBend=el.type=="bend"&&!isHDD;
        double pE=el.pipeEl, tgt;
        if(isBend)tgt=pE>0?std::min(pE*3,500.0):500.0;
        else if(isHDD||L>20000)tgt=pE>0?std::min(pE*10,5000.0):5000.0;
        else tgt=pE>0?std::min(pE*5,1000.0):1000.0;
        tgt=std::max(tgt,200.0);
        int nS=L>tgt?(int)std::ceil(L/tgt):1;
        if(nS<=1){wE.push_back(el);}
        else{int prev=el.n1;
            for(int s=0;s<nS;s++){double f=(double)(s+1)/nS;int next;
                if(s==nS-1)next=el.n2;
                else{next=(int)wN.size();
                    wN.push_back({n1.id+"_s"+std::to_string(s+1),n1.x+dx*f,n1.y+dy*f,n1.z+dz*f,el.d,el.t,n1.DPE,-1});
                    sub2orig.push_back(-1);}
                Element se=el;se.n1=prev;se.n2=next;wE.push_back(se);prev=next;}}
    }

    // Soil spring interpolation for sub-nodes
    std::unordered_map<std::string,SoilSpring*> ssMap;
    for(auto&ss:soilSpr)ssMap[ss.nodeId]=&ss;
    std::vector<SoilSpring> wSoil=soilSpr;
    for(int ni=nN0;ni<(int)wN.size();ni++){
        auto&wn=wN[ni]; if(ssMap.count(wn.id))continue;
        // Find 2 nearest original nodes with soil
        double bd1=1e30,bd2=1e30; SoilSpring*bs1=nullptr,*bs2=nullptr;
        for(auto&[id,sp]:ssMap){
            auto it=std::find_if(nodes.begin(),nodes.end(),[&](const Node&n){return n.id==id;});
            if(it==nodes.end())continue;
            double d2=std::pow(wn.x-it->x,2)+std::pow(wn.y-it->y,2)+std::pow(wn.z-it->z,2),d=std::sqrt(d2);
            if(d<bd1){bd2=bd1;bs2=bs1;bd1=d;bs1=sp;}else if(d<bd2){bd2=d;bs2=sp;}
        }
        if(bs1){
            if(bs2&&bd1+bd2>0){double w1=bd2/(bd1+bd2),w2=bd1/(bd1+bd2);
                wSoil.push_back({wn.id,w1*bs1->kh+w2*bs2->kh,w1*bs1->kv_up+w2*bs2->kv_up,
                    w1*bs1->kv_down+w2*bs2->kv_down,w1*bs1->kAxial+w2*bs2->kAxial,
                    w1*bs1->rMaxSide+w2*bs2->rMaxSide,w1*bs1->rMaxDown+w2*bs2->rMaxDown,
                    w1*bs1->rMaxUp+w2*bs2->rMaxUp,bs1->curveType});}
            else wSoil.push_back({wn.id,bs1->kh,bs1->kv_up,bs1->kv_down,bs1->kAxial,bs1->rMaxSide,bs1->rMaxDown,bs1->rMaxUp,bs1->curveType});
        }
    }

    int nN=(int)wN.size(),nE=(int)wE.size(),nDof=nN*6;
    std::unordered_map<std::string,int> idMap;
    for(int i=0;i<nN;i++)idMap[wN[i].id]=i;

    auto t_subdiv=std::chrono::high_resolution_clock::now();

    // ═══════════════════════════════════════════════════════════
    // Soil node data for bilinear iteration
    // ═══════════════════════════════════════════════════════════
    struct SoilND {
        int ni,bd; double Linfl,DPE,kx,ky,kzd,kzu,kax;
        double rMS,rMD,rMU; double kxE,kyE,kzE,kaxE;
        bool plX,plY,plZ; std::string ct; double rX,rY,rZ;
    };
    std::vector<SoilND> sND;
    for(auto&ss:wSoil){
        auto it=idMap.find(ss.nodeId); if(it==idMap.end())continue;
        int ni=it->second; double Linfl=0;
        for(auto&el:wE){if(el.n1==ni||el.n2==ni){auto&a=wN[el.n1];auto&b=wN[el.n2];
            Linfl+=std::sqrt(std::pow(b.x-a.x,2)+std::pow(b.y-a.y,2)+std::pow(b.z-a.z,2))/2;}}
        if(Linfl<1)Linfl=1000;
        double DPE=wN[ni].DPE,kx=ss.kh*DPE*Linfl,ky=kx,kzd=ss.kv_down*DPE*Linfl,kzu=ss.kv_up*DPE*Linfl;
        double kax=(ss.kAxial>0?ss.kAxial:ss.kh*0.5)*DPE*Linfl;
        double rD=50; // ref displacement for rMax fallback
        double rMS=ss.rMaxSide>0?ss.rMaxSide:kx*rD;
        double rMD=ss.rMaxDown>0?ss.rMaxDown:kzd*rD;
        double rMU=ss.rMaxUp>0?ss.rMaxUp:kzu*rD;
        sND.push_back({ni,ni*6,Linfl,DPE,kx,ky,kzd,kzu,kax,rMS,rMD,rMU,kx,ky,kzd,kax,false,false,false,ss.curveType,0,0,0});
    }

    // ═══════════════════════════════════════════════════════════
    // BILINEAR SOIL ITERATION LOOP
    // ═══════════════════════════════════════════════════════════
    Vec U=Vec::Zero(nDof);
    bool converged=true,soilConv=false; int iter=0;

    struct ElD{M12 T,Kl;double L;GeomSection geo;double sif;MatProps elMat;};
    std::vector<ElD> elD(nE);

    for(iter=0;iter<MAX_SOIL_ITER;iter++){
    SpAsm asm_(nDof); Vec F=Vec::Zero(nDof);
    double G=mat.E/(2*(1+mat.poisson));

    // ─── K-matrix + load vector assembly ───
    for(int ei=0;ei<nE;ei++){
        auto&el=wE[ei]; auto&n1_=wN[el.n1]; auto&n2_=wN[el.n2];
        double D=el.d>0?el.d:139.7,tw=el.t>0?el.t:3.6;
        GeomSection geo=calcGeom(D,tw);
        double dx=n2_.x-n1_.x,dy=n2_.y-n1_.y,dz=n2_.z-n1_.z,L=std::sqrt(dx*dx+dy*dy+dz*dz);
        if(L<0.01){elD[ei].L=0;continue;}

        // Per-element material
        MatProps em=mat;
        auto pit=perElMat.find(ei); if(pit!=perElMat.end()&&pit->second.valid)
            em={pit->second.E,pit->second.poisson,pit->second.alpha,pit->second.SMYS,pit->second.density};
        double eG=em.E/(2*(1+em.poisson));

        double flex=1.0,sif=1.0;
        if(el.type=="bend"&&el.R>0&&el.R<=5000){flex=calcBendFlex(D,tw,el.R,Pi*lc.pressF,em.E);sif=calcBendSIF(D,tw,el.R);}
        else if(el.type=="tee"){
            std::string nid1=wN[el.n1].id,nid2=wN[el.n2].id;
            std::string tref; auto ti=teeNodeMap.find(nid1); if(ti!=teeNodeMap.end())tref=ti->second;
            else{ti=teeNodeMap.find(nid2);if(ti!=teeNodeMap.end())tref=ti->second;}
            auto si=teeSpecs.find(tref);
            if(si!=teeSpecs.end()){double sR,sB;calcTeeSIF(si->second.dRun,si->second.tRun,si->second.dBrn,si->second.tBrn,si->second.type,si->second.te,sR,sB);sif=sR;}
            else{double sR,sB;calcTeeSIF(D,tw,D*0.7,tw,"WELD",0,sR,sB);sif=sR;}
        }

        M12 Kl=buildLocalK(em.E,eG,geo.As,geo.I,geo.I,geo.J,L,em.poisson,flex);
        M12 T=buildT(n1_.x,n1_.y,n1_.z,n2_.x,n2_.y,n2_.z);
        double Kg[144]; TtKT(T,Kl,Kg);
        int dm[12]; for(int i=0;i<6;i++){dm[i]=el.n1*6+i;dm[i+6]=el.n2*6+i;}
        asm_.addEl(Kg,dm);

        // Load vector
        double Fl[12]={};
        double dT=(Toper-Tinstall)*lc.tDifF;
        Fl[0]=-em.E*geo.As*em.alpha*dT; Fl[6]=-Fl[0];
        double Fp=-Pi*lc.pressF*geo.Ab; Fl[0]+=Fp; Fl[6]+=-Fp;
        if(lc.gloadF>0){double w=em.density*9.81e-9*geo.As*lc.gloadF;
            double qx=T(0,2)*(-w),qy=T(1,2)*(-w),qz=T(2,2)*(-w);
            Fl[0]+=qx*L/2;Fl[6]+=qx*L/2;Fl[1]+=qy*L/2;Fl[7]+=qy*L/2;
            Fl[5]+=qy*L*L/12;Fl[11]+=-qy*L*L/12;
            Fl[2]+=qz*L/2;Fl[8]+=qz*L/2;Fl[4]+=-qz*L*L/12;Fl[10]+=qz*L*L/12;}

        for(int i=0;i<12;i++){double s=0;for(int j=0;j<12;j++)s+=T.d[j*12+i]*Fl[j];F(dm[i])+=s;}
        elD[ei]={T,Kl,L,geo,sif,em};
    }

    // ─── Subside ───
    if(lc.setlF>0) for(auto&sb:subs){
        auto it=idMap.find(sb.nodeId);if(it==idMap.end())continue;
        int dZ=it->second*6+2; double d=sb.subzMax*sb.uncF*lc.setlF;
        asm_.add(dZ,dZ,1e12); F(dZ)+=1e12*d;
    }

    // ─── Soil springs (consistent Winkler) ───
    for(auto&sd:sND){int bd=sd.bd;double Li=sd.Linfl;
        if(Li>1){
            auto addCS=[&](int d1,int d2,double k,double sgn){
                double kpl=k/Li;
                asm_.add(bd+d1,bd+d1,kpl*Li*13.0/35.0);
                double kc=kpl*Li*Li*11.0/210.0;
                asm_.add(bd+d1,bd+d2,sgn*kc);asm_.add(bd+d2,bd+d1,sgn*kc);
                asm_.add(bd+d2,bd+d2,kpl*Li*Li*Li/105.0);};
            addCS(0,4,sd.kxE,1);addCS(1,5,sd.kyE,-1);addCS(2,4,sd.kzE,-1);
        }else{asm_.add(bd,bd,sd.kxE);asm_.add(bd+1,bd+1,sd.kyE);asm_.add(bd+2,bd+2,sd.kzE);}
        if(sd.kaxE>0)asm_.add(bd,bd,sd.kaxE*0.1);
        // Plastic forces
        if(sd.plX){double u=U(bd);asm_.add(bd,bd,0);F(bd)-=(u>=0?1:-1)*sd.rMS;}
        if(sd.plY){double u=U(bd+1);F(bd+1)-=(u>=0?1:-1)*sd.rMS;}
        if(sd.plZ){double u=U(bd+2);double rm=u>=0?sd.rMU:sd.rMD;F(bd+2)-=(u>=0?1:-1)*rm;}
    }

    // ─── Support springs ───
    for(auto&sp:sups){auto it=idMap.find(sp.nodeId);if(it==idMap.end())continue;int bd=it->second*6;
        if(sp.type=="fixed"||sp.type=="anchor")for(int d=0;d<6;d++)asm_.add(bd+d,bd+d,1e15);
        else if(sp.type=="guided")for(int d=0;d<3;d++)asm_.add(bd+d,bd+d,1e15);
        else if(sp.type=="spring"){
            if(sp.kx>0)asm_.add(bd,bd,sp.kx);if(sp.ky>0)asm_.add(bd+1,bd+1,sp.ky);
            if(sp.kz>0)asm_.add(bd+2,bd+2,sp.kz);if(sp.krx>0)asm_.add(bd+3,bd+3,sp.krx);
            if(sp.kry>0)asm_.add(bd+4,bd+4,sp.kry);if(sp.krz>0)asm_.add(bd+5,bd+5,sp.krz);}
    }

    // ─── Boundary conditions ───
    for(auto&bc:bcs){auto it=idMap.find(bc.nodeId);if(it==idMap.end())continue;int bd=it->second*6;
        if(bc.type=="fixed"||bc.type=="anchor")for(int d=0;d<6;d++)asm_.add(bd+d,bd+d,1e15);
        else if(bc.type=="guided")for(int d=0;d<3;d++)asm_.add(bd+d,bd+d,1e15);
        else if(bc.type=="spring"){
            if(bc.kx>0)asm_.add(bd,bd,bc.kx);if(bc.ky>0)asm_.add(bd+1,bd+1,bc.ky);
            if(bc.kz>0)asm_.add(bd+2,bd+2,bc.kz);if(bc.krx>0)asm_.add(bd+3,bd+3,bc.krx);
            if(bc.kry>0)asm_.add(bd+4,bd+4,bc.kry);if(bc.krz>0)asm_.add(bd+5,bd+5,bc.krz);}
        else if(bc.type=="infin"){
            auto&nd=wN[it->second]; GeomSection g=calcGeom(nd.D,nd.t);
            double sKh=bc.soilKh>0?bc.soilKh:5.0, sKv=bc.soilKv>0?bc.soilKv:10.0, sKa=bc.soilKaxial>0?bc.soilKaxial:2.5;
            // Try to get soil from nearest node
            if(sKh<=0&&!sND.empty()){auto&s0=sND[0];sKh=s0.kx/(s0.DPE*s0.Linfl);sKv=s0.kzd/(s0.DPE*s0.Linfl);}
            InfinSprings is=calcInfin(mat.E,g.I,g.As,nd.D,nd.DPE,sKh,sKv,sKa);
            asm_.add(bd,bd,is.kx);asm_.add(bd+1,bd+1,is.ky);asm_.add(bd+2,bd+2,is.kz);
            asm_.add(bd+3,bd+3,is.krx);asm_.add(bd+4,bd+4,is.kry);asm_.add(bd+5,bd+5,is.krz);
            asm_.add(bd+1,bd+5,-is.k_cross);asm_.add(bd+5,bd+1,-is.k_cross);
            asm_.add(bd+2,bd+4,is.k_cross);asm_.add(bd+4,bd+2,is.k_cross);
        }
    }
    if(bcs.empty()&&nN>=2)for(int idx:{0,nN-1})for(int d=0;d<6;d++)asm_.add(idx*6+d,idx*6+d,1e15);

    // ─── Solve ───
    SpMat K=asm_.build();
    Eigen::SparseLU<SpMat,Eigen::COLAMDOrdering<int>> slv;
    slv.analyzePattern(K);slv.factorize(K);
    bool ok=(slv.info()==Eigen::Success);
    if(ok){U=slv.solve(F);ok=(slv.info()==Eigen::Success);}
    if(!ok){converged=false;break;}

    // Divergence check
    double maxD=0;for(int i=0;i<nDof;i++){if(!std::isfinite(U(i))){U(i)=0;converged=false;}if(std::abs(U(i))>maxD)maxD=std::abs(U(i));}
    if(maxD>1e6){converged=false;break;}

    // ─── Soil convergence check (bilinear/tanh) ───
    if(sND.empty()){soilConv=true;break;}
    bool anyChanged=false;
    for(auto&sd:sND){double ux=U(sd.bd),uy=U(sd.bd+1),uz=U(sd.bd+2);
        if(sd.ct=="tanh"){
            auto tanhK=[](double k,double rM,double d)->double{if(rM<1e-10||std::abs(d)<1e-10)return k;
                double a=k*std::abs(d)/rM,th=std::tanh(a);return k*(1-th*th);};
            double kxN=tanhK(sd.kx,sd.rMS,ux),kyN=tanhK(sd.ky,sd.rMS,uy);
            double kzD=uz>=0?sd.kzu:sd.kzd,rMZ=uz>=0?sd.rMU:sd.rMD;
            double kzN=tanhK(kzD,rMZ,uz);
            if(std::abs(kxN-sd.kxE)/std::max(sd.kxE,1.0)>0.01){sd.kxE=kxN;anyChanged=true;}
            if(std::abs(kyN-sd.kyE)/std::max(sd.kyE,1.0)>0.01){sd.kyE=kyN;anyChanged=true;}
            if(std::abs(kzN-sd.kzE)/std::max(sd.kzE,1.0)>0.01){sd.kzE=kzN;anyChanged=true;}
            auto tanhR=[](double k,double rM,double d)->double{return rM*std::tanh(k*std::abs(d)/rM)*(d>=0?1:-1);};
            sd.rX=tanhR(sd.kx,sd.rMS,ux);sd.rY=tanhR(sd.ky,sd.rMS,uy);sd.rZ=tanhR(kzD,rMZ,uz);
        }else{ // bilinear
            auto bilinCheck=[&](double&kE,bool&pl,double kOrig,double rMax,double u){
                double rf=kE*std::abs(u);
                if(rf>rMax&&!pl){pl=true;kE=std::abs(u)>1e-6?rMax/std::abs(u):kOrig;anyChanged=true;}
                else if(rf<rMax*0.95&&pl){pl=false;kE=kOrig;anyChanged=true;}};
            bilinCheck(sd.kxE,sd.plX,sd.kx,sd.rMS,ux);
            bilinCheck(sd.kyE,sd.plY,sd.ky,sd.rMS,uy);
            double kzD=uz>=0?sd.kzu:sd.kzd,rMZ=uz>=0?sd.rMU:sd.rMD;
            bilinCheck(sd.kzE,sd.plZ,kzD,rMZ,uz);
            sd.rX=sd.kxE*ux;sd.rY=sd.kyE*uy;sd.rZ=sd.kzE*uz;
        }
    }
    if(!anyChanged){soilConv=true;break;}
    } // end soil iteration

    auto t_solve=std::chrono::high_resolution_clock::now();

    // ═══════════════════════════════════════════════════════════
    // Element force recovery
    // ═══════════════════════════════════════════════════════════
    std::vector<double> nFx(nN,0),nMy(nN,0),nMz(nN,0),nMx(nN,0);
    for(int ei=0;ei<nE;ei++){
        if(elD[ei].L<0.01)continue; auto&el=wE[ei]; auto&ed=elD[ei];
        double Ug[12]; for(int i=0;i<6;i++){Ug[i]=U(el.n1*6+i);Ug[i+6]=U(el.n2*6+i);}
        double Ul[12]; for(int i=0;i<12;i++){double s=0;for(int j=0;j<12;j++)s+=ed.T(i,j)*Ug[j];Ul[i]=s;}
        double Fl[12]; for(int i=0;i<12;i++){double s=0;for(int j=0;j<12;j++)s+=ed.Kl(i,j)*Ul[j];Fl[i]=s;}
        auto upd=[](double&c,double v){if(std::abs(v)>std::abs(c))c=v;};
        upd(nFx[el.n1],Fl[0]);upd(nMy[el.n1],Fl[4]);upd(nMz[el.n1],Fl[5]);upd(nMx[el.n1],Fl[3]);
        upd(nFx[el.n2],Fl[6]);upd(nMy[el.n2],Fl[10]);upd(nMz[el.n2],Fl[11]);upd(nMx[el.n2],Fl[9]);
    }

    // ═══════════════════════════════════════════════════════════
    // Stress + Ring model + Unity check
    // ═══════════════════════════════════════════════════════════
    auto rArr=Napi::Array::New(env); double maxUC=0,maxVM=0;

    for(int ni=0;ni<nN;ni++){
        if(sub2orig[ni]==-1)continue; // skip sub-nodes
        auto&nd=wN[ni]; double D=nd.D>0?nd.D:139.7,tw=nd.t>0?nd.t:3.6;
        GeomSection geo=calcGeom(D,tw);

        // Find SIF + material for this node
        double sif=1.0; MatProps em=mat;
        for(int ei=0;ei<nE;ei++){if(wE[ei].n1==ni||wE[ei].n2==ni){
            if(elD[ei].sif>sif)sif=elD[ei].sif;em=elD[ei].elMat;break;}}

        double sh=(Pi*lc.pressF*D)/(2*tw);
        double slp=em.poisson*sh;
        double ToperEff=Tinstall+(Toper-Tinstall)*lc.tDifF;
        double st=-em.E*em.alpha*(ToperEff-Tinstall);
        double My=nMy[ni],Mz=nMz[ni],Mres=std::sqrt(My*My+Mz*Mz);
        double sb=geo.W>0?(Mres/geo.W)*sif:0;
        double Fx=nFx[ni],sa=geo.As>0?Fx/geo.As:0;
        double sl=sa+sb+slp;
        double Mx=nMx[ni],tau=geo.rm>0&&tw>0?Mx/(2*PI_VAL*geo.rm*geo.rm*tw):0;
        double vm=vonMises(sh,sl,tau);

        // ─── 48-point ring model ───
        double sigHoop=(Pi*lc.pressF*D)/(2*tw);
        // Soil pressure (neutral)
        double qSoilV=0,qSoilH=0;
        for(auto&sd:sND){if(sd.ni==ni){
            double coverMm=500,gamma=17,K0=0.5,Hm=coverMm/1000;
            qSoilV=gamma*Hm*1e-3;qSoilH=K0*gamma*Hm*1e-3;break;}}

        double sigAxial=sa, momentAngle=Mres>0?std::atan2(Mz,My):0;
        double pAvg=(qSoilV+qSoilH)/2,deltaP=qSoilV-qSoilH;
        double sfSoilMem=pAvg*geo.rm/tw;
        double MringMax=std::abs(deltaP)*geo.rm*geo.rm/6;
        double Iwall=tw*tw*tw/12;
        double tauT=Mx/(2*PI_VAL*geo.rm*geo.rm*tw);
        double vmRingMax=0;

        for(int p=0;p<RING_N_POINTS;p++){
            double theta=p*(2*PI_VAL/RING_N_POINTS);
            double sBend=geo.W>0?(Mres/geo.W)*std::cos(theta-momentAngle)*sif:0;
            double sxMem=sigAxial+em.poisson*sigHoop;
            double sxIn=sxMem+sBend,sxOut=sxMem-sBend;
            double sfMem=sigHoop+sfSoilMem;
            double sfRB=Iwall>0?MringMax*std::cos(2*theta)*(tw/2)/Iwall:0;
            double sfIn=sfMem+sfRB,sfOut=sfMem-sfRB;
            double vmI=std::sqrt(sxIn*sxIn-sxIn*sfIn+sfIn*sfIn+3*tauT*tauT);
            double vmO=std::sqrt(sxOut*sxOut-sxOut*sfOut+sfOut*sfOut+3*tauT*tauT);
            vmRingMax=std::max({vmRingMax,vmI,vmO});
        }
        vm=std::max(vm,vmRingMax);

        // Unity check
        double sha=dF*em.SMYS*wF, vma=0.85*em.SMYS/gM*wF;
        double ucR=sha>0?std::abs(sh)/sha:0,ucV=vma>0?vm/vma:0;
        double uc=std::max(ucR,ucV);
        if(uc>maxUC)maxUC=uc; if(vm>maxVM)maxVM=vm;

        // Soil reactions
        double srX=0,srY=0,srZ=0;
        for(auto&sd:sND){if(sd.ni==ni){srX=sd.rX;srY=sd.rY;srZ=sd.rZ;break;}}

        int bd=ni*6;
        auto nr=Napi::Object::New(env);
        nr.Set("nodeId",nd.id); nr.Set("sh",sh);nr.Set("sl",sl);nr.Set("vm",vm);
        nr.Set("st",st);nr.Set("sb",sb);nr.Set("slp",slp);
        nr.Set("Fx",Fx);nr.Set("My",My);nr.Set("Mz",Mz);
        nr.Set("ux",U(bd));nr.Set("uy",U(bd+1));nr.Set("uz",U(bd+2));
        nr.Set("rx",U(bd+3));nr.Set("ry",U(bd+4));nr.Set("rz",U(bd+5));
        nr.Set("uc",uc);nr.Set("ucRing",ucR);nr.Set("ucVM",ucV);nr.Set("sif",sif);
        nr.Set("soilRx",srX);nr.Set("soilRy",srY);nr.Set("soilRz",srZ);
        rArr.Set(rArr.Length(),nr);
    }

    auto t_end=std::chrono::high_resolution_clock::now();
    auto ms=[](auto a,auto b){return std::chrono::duration<double,std::milli>(b-a).count();};

    auto res=Napi::Object::New(env);
    res.Set("nodeResults",rArr);res.Set("maxUC",maxUC);res.Set("maxVM",maxVM);
    res.Set("nNodes",nN);res.Set("nElements",nE);res.Set("nDof",nDof);
    res.Set("nnz",0);res.Set("solveOk",converged);
    res.Set("converged",converged&&soilConv);
    res.Set("iterations",iter+1);
    res.Set("plasticNodeCount",(int)std::count_if(sND.begin(),sND.end(),[](auto&s){return s.plX||s.plY||s.plZ;}));

    auto st_=Napi::Object::New(env);
    st_.Set("ms_parse",ms(t0,t_parse));st_.Set("ms_subdiv",ms(t_parse,t_subdiv));
    st_.Set("ms_solve",ms(t_subdiv,t_solve));st_.Set("ms_stress",ms(t_solve,t_end));
    st_.Set("ms_total",ms(t0,t_end));
    res.Set("stats",st_);
    return res;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("solve",Napi::Function::New(env,Solve));
    return exports;
}
NODE_API_MODULE(kaimple_engine, Init)
