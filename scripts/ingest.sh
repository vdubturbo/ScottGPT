#!/usr/bin/env bash
set -euo pipefail

# Force unbuffered output for real-time streaming
export PYTHONUNBUFFERED=1

# Function to log progress in real-time
log_progress() {
    echo "$1" | tee -a "${PROGRESS_LOG:-/dev/null}"
}

log_progress "🚀 Starting ScottGPT ingestion pipeline..."

# Load environment variables from .env file
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
    log_progress "✅ Loaded environment variables from .env"
fi

# Clean up any previous .work directory to avoid processing old files
if [ -d ".work" ]; then
    log_progress "🧹 Cleaning up previous work directory..."
    rm -rf .work
fi

# Check if pandoc is available
if ! command -v pandoc &> /dev/null; then
    echo "❌ Error: pandoc is required but not installed."
    echo "Install with: brew install pandoc (macOS) or apt-get install pandoc (Ubuntu)"
    exit 1
fi

# Check for required environment variables
log_progress "🔑 Checking environment variables..."

required_vars=("OPENAI_API_KEY" "COHERE_API_KEY" "SUPABASE_URL" "SUPABASE_ANON_KEY")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        missing_vars+=("$var")
    else
        log_progress "   ✅ $var is set"
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "❌ Error: Required environment variables are missing:"
    for var in "${missing_vars[@]}"; do
        echo "   - $var"
    done
    echo "
Please check your .env file and ensure all required variables are set."
    exit 1
fi

log_progress "✅ All required environment variables are present"

# Create all required working directories
mkdir -p .work/normalized .work/extracted .work/validated
mkdir -p sources/jobs sources/projects sources/education sources/certs sources/bio
mkdir -p logs config incoming processed
echo "✅ Required directories created"

# Function to verify step completion
verify_step_output() {
    local step_name="$1"
    local expected_output_dir="$2"
    local min_files="$3"
    
    if [ -n "$expected_output_dir" ] && [ -d "$expected_output_dir" ]; then
        local file_count=$(find "$expected_output_dir" -name "*.md" | wc -l)
        if [ "$file_count" -ge "${min_files:-1}" ]; then
            log_progress "✅ ${step_name} verification: ${file_count} files found in ${expected_output_dir}"
            return 0
        else
            echo "❌ ${step_name} verification failed: Expected at least ${min_files:-1} files in ${expected_output_dir}, found ${file_count}"
            return 1
        fi
    else
        echo "❌ ${step_name} verification failed: Output directory ${expected_output_dir} not found"
        return 1
    fi
}

# Function to run a step with validation
run_step() {
    local step_num="$1"
    local step_name="$2"
    local script_name="$3"
    local output_dir="$4"
    local min_files="$5"
    
    log_progress "📄 Step ${step_num}: ${step_name}..."
    
    if ! node "scripts/${script_name}.js" 2>&1; then
        echo "❌ Step ${step_num} (${step_name}) failed with exit code $?"
        echo "Check logs for details. Pipeline cannot continue."
        exit 1
    fi
    
    if [ -n "$output_dir" ]; then
        if verify_step_output "$step_name" "$output_dir" "$min_files"; then
            log_progress "✅ Step ${step_num} (${step_name}) completed successfully"
        else
            echo "❌ Step ${step_num} (${step_name}) validation failed"
            exit 1
        fi
    else
        log_progress "✅ Step ${step_num} (${step_name}) completed"
    fi
}

# Execute pipeline steps with validation
run_step "1" "Normalizing documents" "normalize" ".work/normalized" 1
run_step "2" "Extracting structured data" "extract" ".work/extracted" 1  
run_step "3" "Validating content" "validate" ".work/validated" 1
run_step "4" "Writing to source files" "write" "sources" 1
run_step "5" "Indexing and embedding" "indexer" "" ""

# Verify final results
log_progress "📌a Verifying pipeline results..."

# Check if any source files were created
source_count=0
for dir in sources/jobs sources/projects sources/education sources/certs sources/bio; do
    if [ -d "$dir" ]; then
        dir_count=$(find "$dir" -name "*.md" | wc -l)
        source_count=$((source_count + dir_count))
    fi
done

if [ "$source_count" -eq 0 ]; then
    echo "⚠️ Warning: No source files were created. Check your input files and configuration."
    echo "Pipeline completed but may not have processed any content."
else
    log_progress "✅ Pipeline verification: ${source_count} source files created"
fi

# Files were already moved during normalization step
log_progress "📦 Files moved during processing (see normalization step)"
processed_count="N/A - moved during processing"

# Final summary
log_progress "✅ ScottGPT ingestion complete!"
log_progress "📊 Final Summary:"
log_progress "   - Source files created: ${source_count}"
log_progress "   - Input files processed: ${processed_count}"
log_progress "   - Temporary files preserved in .work/ for debugging"
log_progress "📋 Next: Check the database for new chunks and sources"