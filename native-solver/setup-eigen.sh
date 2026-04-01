#!/bin/bash
# Download Eigen (header-only C++ linear algebra library)
# Version 3.4.0 — stable, widely used, excellent sparse solver support

set -e

EIGEN_VERSION="3.4.0"
EIGEN_DIR="deps/eigen"

if [ -f "$EIGEN_DIR/Eigen/Core" ]; then
  echo "Eigen already present in $EIGEN_DIR"
  exit 0
fi

# If directory exists but is incomplete, wipe and re-download
if [ -d "$EIGEN_DIR" ]; then
  rm -rf "$EIGEN_DIR"
fi

echo "Downloading Eigen $EIGEN_VERSION..."
mkdir -p deps
cd deps

# Download from GitLab (official Eigen repository)
curl -sL "https://gitlab.com/libeigen/eigen/-/archive/$EIGEN_VERSION/eigen-$EIGEN_VERSION.tar.gz" -o eigen.tar.gz

echo "Extracting..."
tar xzf eigen.tar.gz
mv "eigen-$EIGEN_VERSION" eigen
rm eigen.tar.gz

echo "Eigen $EIGEN_VERSION installed to $EIGEN_DIR"
echo "Headers available at: $EIGEN_DIR/Eigen/"
ls eigen/Eigen/ | head -10
