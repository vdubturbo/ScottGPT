#!/bin/bash

echo "🧹 Cleaning workspace for fresh test..."
echo "======================================"

# Clean all work directories 
rm -rf .work/extracted/*
rm -rf .work/validated/*
rm -rf .work/normalized/*

# Clean source directories
rm -rf sources/jobs/*
rm -rf sources/projects/*
rm -rf sources/education/*
rm -rf sources/certs/*
rm -rf sources/bio/*

echo "✅ Workspace cleaned"
echo ""
echo "📋 Ready for fresh pipeline test"
echo "Expected: Multiple extractions and proper date handling"