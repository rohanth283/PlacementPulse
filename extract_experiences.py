#!/usr/bin/env python3
import os
import sys
import json
import argparse
import time
import random
from collections import Counter
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# Try to import google-genai
try:
    from google import genai
    from google.genai import types
except ImportError:
    print("[ERROR] google-genai package is not installed. Please run: pip install google-genai")
    sys.exit(1)

# Pydantic Schemas for Structured Extraction
class QuestionDetail(BaseModel):
    question_text: str = Field(description="The question prompt, problem statement, or description of the question asked in the interview.")
    question_type: str = Field(description="The category of the question (e.g., Coding, Conceptual/Theory, Resume-based, Project-based, HR/Behavioral, System Design).")
    topics: List[str] = Field(description="List of specific concepts, algorithms, or topics covered by this question (e.g., Arrays, Sliding Window, Stack, DBMS, SQL, OOP, Operating Systems, Networks).")

class InterviewRound(BaseModel):
    round_name: str = Field(description="Name or type of the round (e.g., Online Test, Technical Round 1, Technical Round 2, HR Round, Managerial Round).")
    duration: Optional[str] = Field(description="Duration of the round (e.g., '1 hr', '45 mins', '1 hr 30 mins') or null if not specified.")
    questions: List[QuestionDetail] = Field(description="List of questions asked in this specific round.")

class InterviewExperience(BaseModel):
    source_file: str = Field(description="The exact source file name (e.g., 'AASHIN A P-Appian.txt') from which this experience was extracted.")
    candidate_name: str = Field(description="The name of the candidate who shared the experience.")
    company: str = Field(description="Name of the company they interviewed with (e.g., Appian, SAP Labs, Amazon, Wells Fargo).")
    role: Optional[str] = Field(description="The job title/role they applied for (e.g., Software Development Engineer, SDE Intern, Analyst) or null if not specified.")
    package: Optional[str] = Field(description="The compensation/salary package offered (e.g., '25.5 LPA', '18 Lakhs') or null if not specified.")
    location: Optional[str] = Field(description="The job location if mentioned, or null.")
    rounds: List[InterviewRound] = Field(description="The list of rounds described in the experience.")
    overall_difficulty: str = Field(description="Inferred overall difficulty of the selection process: 'Easy', 'Medium', or 'Hard'.")
    topics_covered: List[str] = Field(description="Consolidated list of technical, theoretical, or project topics covered across all rounds.")
    general_tips: List[str] = Field(description="General advice, tips, preparation strategies, or final suggestions mentioned by the candidate.")

class InterviewExperiencesBatch(BaseModel):
    experiences: List[InterviewExperience] = Field(description="List of extracted interview experiences from the provided documents.")


def load_api_key(passed_key: Optional[str]) -> Optional[str]:
    """Retrieves the Gemini API Key from command arguments, environment variables, or .env files."""
    if passed_key:
        return passed_key
    
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ.get("GEMINI_API_KEY")
    
    # Check for .env file
    env_paths = [".env", "../.env", "backend/.env"]
    for path in env_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEY="):
                            parts = line.split("=", 1)
                            if len(parts) > 1:
                                val = parts[1].strip()
                                # Strip quotes if present
                                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                                    val = val[1:-1]
                                return val
            except Exception:
                pass
    return None


def call_gemini_with_retry(client: genai.Client, model: str, contents: str, config: types.GenerateContentConfig, max_retries: int = 6) -> Any:
    """Invokes Gemini API with exponential backoff for handling rate limits (429/503)."""
    delay = 6.0  # Initial delay in seconds
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config
            )
            return response
        except Exception as e:
            err_str = str(e).lower()
            is_rate_limit = "429" in err_str or "quota" in err_str or "resource" in err_str or "rate" in err_str
            is_unavailable = "503" in err_str or "unavailable" in err_str
            
            if attempt == max_retries - 1:
                raise e
            
            if is_rate_limit:
                # Add extra delay for free tier exhaustion
                sleep_time = delay + random.uniform(5.0, 10.0)
                print(f"\n[RATE LIMIT] Rate limit hit. Sleeping for {sleep_time:.1f}s (Attempt {attempt+1}/{max_retries})...")
                time.sleep(sleep_time)
                delay *= 2  # Exponential backoff
            elif is_unavailable:
                sleep_time = 5.0 + random.uniform(1.0, 3.0)
                print(f"\n[TEMPORARY OVERLOAD] Gemini overloaded (503). Retrying in {sleep_time:.1f}s (Attempt {attempt+1}/{max_retries})...")
                time.sleep(sleep_time)
            else:
                sleep_time = 3.0 + random.uniform(1.0, 2.0)
                print(f"\n[ERROR] Transient error: {e}. Retrying in {sleep_time:.1f}s (Attempt {attempt+1}/{max_retries})...")
                time.sleep(sleep_time)


def process_batch(batch_files: List[str], client: genai.Client, model: str, max_retries: int = 6) -> List[Dict[str, Any]]:
    """Reads a batch of files and sends them to Gemini to extract structured interview experience data.
    If the batch fails, it automatically splits the batch in half recursively."""
    batch_contents = []
    for filepath in batch_files:
        filename = os.path.basename(filepath)
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read().strip()
                if content:
                    batch_contents.append((filename, content))
        except Exception as e:
            print(f"[ERROR] Failed to read {filename}: {e}")
            
    if not batch_contents:
        return []
        
    # Construct combined prompt
    prompt = f"""
You are an expert data extraction assistant. Analyze the {len(batch_contents)} interview experience documents provided below.

For each document:
1. Extract the interview experience details according to the schema.
2. Ensure you map each experience to its corresponding 'source_file' name exactly as shown in the headings.
3. Infer candidate name and company name from the source file name (e.g. for "AASHIN A P-Appian.txt", candidate is "AASHIN A P" and company is "Appian") or the document content.

Documents to analyze:
"""
    for filename, content in batch_contents:
        prompt += f"\n\n==================================================\n"
        prompt += f"SOURCE FILE: {filename}\n"
        prompt += f"==================================================\n"
        prompt += content
        
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=InterviewExperiencesBatch,
        temperature=0.1
    )
    
    try:
        response = call_gemini_with_retry(client, model, prompt, config, max_retries)
        if response and response.text:
            batch_res = json.loads(response.text)
            return batch_res.get("experiences", [])
    except Exception as e:
        print(f"\n[ERROR] Failed to process batch of {len(batch_files)} files: {e}")
        # If the batch size is greater than 1, split it in half and process recursively!
        if len(batch_files) > 1:
            mid = len(batch_files) // 2
            left_half = batch_files[:mid]
            right_half = batch_files[mid:]
            print(f"[RECOVER] Splitting batch of {len(batch_files)} into two smaller batches of size {len(left_half)} and {len(right_half)}...")
            # Sleep to cool down rate limits
            time.sleep(5)
            left_res = process_batch(left_half, client, model, max_retries)
            time.sleep(5)
            right_res = process_batch(right_half, client, model, max_retries)
            return left_res + right_res
        else:
            print(f"[ERROR] Failed to process single file {os.path.basename(batch_files[0])} even after retries. Skipping.")
            
    return []


def generate_study_plan(client: genai.Client, model: str, experiences: List[Dict[str, Any]], sorted_topics: List[tuple]) -> str:
    """Calls Gemini to generate a tailored Study Plan based on the aggregated data."""
    # 1. Format topic frequencies
    formatted_topics = "\n".join([f"- {topic}: {count} occurrences" for topic, count in sorted_topics])
    
    # 2. Extract some common questions and companies/roles
    questions_summary = []
    companies_counter = Counter()
    roles_counter = Counter()
    
    for exp in experiences:
        company = exp.get("company", "Unknown")
        role = exp.get("role", "Unknown")
        if company: companies_counter[company] += 1
        if role: roles_counter[role] += 1
        
        for rnd in exp.get("rounds", []):
            for q in rnd.get("questions", []):
                q_text = q.get("question_text", "").strip()
                q_type = q.get("question_type", "").strip()
                q_topics = ", ".join(q.get("topics", []))
                if q_text:
                    questions_summary.append(f"- [{company} | {q_type}] {q_text} (Topics: {q_topics})")
                    
    # Select a sample of 30 interesting questions to give context to the planner
    sampled_questions = random.sample(questions_summary, min(len(questions_summary), 30))
    formatted_questions = "\n".join(sampled_questions)
    
    # Format companies and roles
    top_companies = "\n".join([f"- {c}: {count} interviews" for c, count in companies_counter.most_common(10)])
    top_roles = "\n".join([f"- {r}: {count} instances" for r, count in roles_counter.most_common(5)])
    
    prompt = f"""
You are an expert technical interview coach. You are given an aggregated list of topics, questions, and frequencies extracted from {len(experiences)} real student interview experiences.

Here is the aggregated data:

### 1. Top Companies (Represented in the data):
{top_companies}

### 2. Job Roles:
{top_roles}

### 3. Topic Frequencies (from most frequent to least frequent):
{formatted_topics}

### 4. Sample of Specific Questions Asked:
{formatted_questions}

Based on this real-world interview data, write a highly structured, comprehensive, and actionable study plan.

The output must be formatted as plain text with markdown elements, and include the following sections:
1. **EXECUTIVE SUMMARY & KEY TRENDS**:
   - Analysis of which technical topics are absolutely critical (the "must-haves").
   - Summary of the interview structures (Online test patterns vs technical rounds).
2. **RANKED TOPICS LIST**:
   - A clean list showing topics sorted from most frequent to least frequent with their occurrence counts.
3. **PHASE-BY-PHASE STUDY PLAN**:
   - Organize the study plan into logical chronological phases (e.g., Phase 1: High Priority, Phase 2: Medium Priority, Phase 3: Conceptual & HR).
   - In each phase, detail:
     - **Concepts to master** (core theoretical/algorithmic items).
     - **Practice targets** (kinds of questions to solve, referencing the real questions if applicable).
     - **Standard LeetCode/GeeksforGeeks equivalents** (e.g. Merge Intervals, BFS on grids, sliding window, etc.).
4. **COMPANY-SPECIFIC PREPARATION NOTES**:
   - Specific notes for the top 5 companies on what they focus on based on the questions.
5. **CANDIDATE TIPS & STRATEGIES**:
   - General advice and preparation suggestions aggregated from the reports (e.g. how to present your approach, resume advice, system details, behavioral advice).

Make sure the Study Plan is detailed, highly practical, and directly helps a candidate prep efficiently.
"""
    print("Generating Study Plan using Gemini...")
    config = types.GenerateContentConfig(temperature=0.2)
    response = call_gemini_with_retry(client, model, prompt, config)
    return response.text if response else ""


def main():
    parser = argparse.ArgumentParser(description="Extract interview experiences using Gemini and generate a study plan.")
    parser.add_argument("-i", "--input-dir", default="text", help="Directory containing interview text files (default: 'text')")
    parser.add_argument("-b", "--batch-size", type=int, default=15, help="Number of files to batch together in a single API call (default: 15)")
    parser.add_argument("-d", "--delay", type=float, default=12.0, help="Delay in seconds between batch requests to avoid rate limits (default: 12.0)")
    parser.add_argument("-o", "--output-json", default="extracted_experiences.json", help="JSON output file (default: 'extracted_experiences.json')")
    parser.add_argument("-t", "--output-text", default="interview_analysis_and_study_plan.txt", help="Final output text/study plan file (default: 'interview_analysis_and_study_plan.txt')")
    parser.add_argument("-k", "--api-key", help="Gemini API Key (can also be set in GEMINI_API_KEY environment variable or a .env file)")
    parser.add_argument("-m", "--model", default="gemini-2.5-flash", help="Gemini model to use (default: 'gemini-2.5-flash')")
    parser.add_argument("-l", "--limit", type=int, help="Limit number of files to process (useful for testing)")
    
    args = parser.parse_args()
    
    # Resolve API Key
    api_key = load_api_key(args.api_key)
    if not api_key:
        print("[ERROR] Gemini API Key not found!")
        print("Please set the GEMINI_API_KEY environment variable, write it to a .env file (GEMINI_API_KEY=your_key), or pass it via --api-key.")
        sys.exit(1)
        
    # Initialize Google GenAI client
    client = genai.Client(api_key=api_key)
    
    # Check input directory
    input_dir = args.input_dir
    if not os.path.exists(input_dir):
        # Check relative path
        script_dir = os.path.dirname(os.path.abspath(__file__))
        input_dir = os.path.join(script_dir, args.input_dir)
        if not os.path.exists(input_dir):
            print(f"[ERROR] Input directory '{args.input_dir}' not found.")
            sys.exit(1)
            
    # List files
    files = [os.path.join(input_dir, f) for f in os.listdir(input_dir) if f.endswith(".txt")]
    files.sort()
    
    if args.limit:
        print(f"Limiting scan to {args.limit} files for testing.")
        files = files[:args.limit]
        
    total_files = len(files)
    if total_files == 0:
        print(f"[WARNING] No .txt files found in directory: {input_dir}")
        sys.exit(0)
        
    # Divid files into batches
    batch_size = args.batch_size
    delay = args.delay
    batches = [files[i:i + batch_size] for i in range(0, len(files), batch_size)]
    total_batches = len(batches)
    
    print(f"Divided {total_files} files into {total_batches} batches of size up to {batch_size}.")
    print(f"Using model: {args.model} with a {delay}s delay between requests to stay under rate limits.")
    
    extracted_data = []
    start_time = time.time()
    
    for idx, batch in enumerate(batches, 1):
        print(f"\nProcessing batch {idx}/{total_batches} ({len(batch)} files)...")
        batch_experiences = process_batch(batch, client, args.model)
        extracted_data.extend(batch_experiences)
        print(f"Batch {idx}/{total_batches} completed. Extracted {len(batch_experiences)} experiences.")
        
        # Delay to avoid rate limit (only if not the last batch)
        if idx < total_batches:
            print(f"Sleeping for {delay} seconds to stay under rate limit...")
            time.sleep(delay)
            
    duration = time.time() - start_time
    print(f"\nScan complete in {duration:.1f} seconds.")
    print(f"Successfully processed and extracted {len(extracted_data)} interview experiences.")
    
    if not extracted_data:
        print("[ERROR] No data extracted from any file. Exiting.")
        sys.exit(1)
        
    # Save the raw JSON data
    try:
        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(extracted_data, f, indent=2, ensure_ascii=False)
        print(f"Saved raw JSON database to: {args.output_json}")
    except Exception as e:
        print(f"[ERROR] Failed to save JSON database: {e}")

    # Aggregate topics
    topic_counter = Counter()
    for exp in extracted_data:
        topics = set()
        
        # 1. Main topics_covered list
        for t in exp.get("topics_covered", []):
            if t: topics.add(t.strip().title())
            
        # 2. Individual questions topics
        for rnd in exp.get("rounds", []):
            for q in rnd.get("questions", []):
                for qt in q.get("topics", []):
                    if qt: topics.add(qt.strip().title())
                    
        # Update counter
        for topic in topics:
            topic_counter[topic] += 1
            
    # Sort topics by frequency
    sorted_topics = topic_counter.most_common()
    
    # Generate study plan
    try:
        study_plan_content = generate_study_plan(client, args.model, extracted_data, sorted_topics)
        
        # Build the final text output
        final_output = []
        final_output.append("=========================================================================")
        final_output.append("INTERVIEW EXPERIENCE ANALYSIS & COMPREHENSIVE STUDY PLAN")
        final_output.append("=========================================================================\n")
        final_output.append(f"Total Experiences Scanned: {len(extracted_data)}")
        final_output.append(f"Analysis Generation Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        final_output.append("-------------------------------------------------------------------------")
        final_output.append("PART 1: TOPIC FREQUENCIES (From Most to Least Asked)")
        final_output.append("-------------------------------------------------------------------------")
        for i, (topic, count) in enumerate(sorted_topics, 1):
            percentage = (count / len(extracted_data)) * 100
            final_output.append(f"{i:2d}. {topic:<30} | {count:3d} occurrences ({percentage:.1f}% of interviews)")
        final_output.append("")
        
        final_output.append("-------------------------------------------------------------------------")
        final_output.append("PART 2: TAILORED STUDY PLAN & PREPARATION GUIDE")
        final_output.append("-------------------------------------------------------------------------")
        final_output.append(study_plan_content)
        
        final_text = "\n".join(final_output)
        
        with open(args.output_text, "w", encoding="utf-8") as f:
            f.write(final_text)
            
        print(f"\n[SUCCESS] Saved comprehensive study plan report to: {args.output_text}")
        
    except Exception as e:
        print(f"[ERROR] Failed to generate study plan report: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
