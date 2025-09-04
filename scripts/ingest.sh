#!/usr/bin/env bash
set -euo pipefail

# Force unbuffered output for real-time streaming
export PYTHONUNBUFFERED=1

# Error handling - preserve files in incoming/ on failure
cleanup_on_error() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo "❌ Pipeline failed with exit code $exit_code"
        echo "📁 Files preserved in incoming/ directory for retry"
        echo "🔍 Check the error messages above for troubleshooting"
    fi
    exit $exit_code
}

# Set up error trap
trap cleanup_on_error ERR

# Function to log progress - simplified for direct output
log_progress() {
    echo "$1"
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

required_vars=("OPENAI_API_KEY" "COHERE_API_KEY" "SUPABASE_URL" "SUPABASE_ANON_KEY" "SUPABASE_SERVICE_ROLE_KEY")
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

# Files will be moved after complete pipeline success
processed_count="Will be determined during final cleanup"

# Move processed files to final location now that pipeline succeeded
log_progress "📦 Moving successfully processed files to archive..."
if [ -d "incoming" ]; then
    # Ensure processed directory exists
    mkdir -p processed
    
    moved_count=0
    for file in incoming/*; do
        # Skip if no files match (when glob doesn't find anything)
        [ -e "$file" ] || continue
        
        # Skip .DS_Store and other hidden files
        filename=$(basename "$file")
        if [[ "$filename" != .* ]] && [[ "$filename" =~ \.(pdf|docx|doc|txt|md)$ ]]; then
            mv "$file" "processed/"
            log_progress "   📁 Moved: $filename"
            moved_count=$((moved_count + 1))
        fi
    done
    
    if [ "$moved_count" -gt 0 ]; then
        log_progress "✅ Successfully archived $moved_count processed files"
    else
        log_progress "ℹ️  No files to archive (already processed or no valid documents)"
    fi
else
    log_progress "⚠️  No incoming directory found - files may have been processed already"
fi

# Final summary
log_progress "✅ ScottGPT ingestion complete!"
log_progress "📊 Final Summary:"
log_progress "   - Source files created: ${source_count}"
log_progress "   - Input files processed: ${processed_count}"
log_progress "   - Files archived: ${moved_count:-0}"
log_progress "   - Temporary files preserved in .work/ for debugging"
log_progress "📋 Next: Check the database for new chunks and sources"