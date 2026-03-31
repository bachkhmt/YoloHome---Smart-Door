import shutil
from pathlib import Path

def clear_pycache(directory=".", exclude_dirs=(".venv", "venv", "env")):
    """
    Clears __pycache__ folders but skips anything inside a virtual environment.
    """
    base_path = Path(directory)
    print(f"--- Starting cleanup in: {base_path.absolute()} ---")
    print(f"Excluding: {exclude_dirs}\n")
    
    deleted_count = 0

    # 1. Remove __pycache__ directories
    for folder in base_path.rglob("__pycache__"):
        # Check if any part of the path (like '.venv') is in the exclude list
        if any(ex in folder.parts for ex in exclude_dirs):
            continue
            
        if folder.is_dir():
            print(f"Removing: {folder}")
            shutil.rmtree(folder)
            deleted_count += 1

    # 2. Remove stray bytecode files (also skipping venv)
    for file in base_path.rglob("*.py[co]"):
        if any(ex in file.parts for ex in exclude_dirs):
            continue

        if file.is_file():
            print(f"Removing file: {file}")
            file.unlink()
            deleted_count += 1

    if deleted_count == 0:
        print("No items to clear outside of excluded directories.")
    else:
        print(f"\nCleanup finished. Removed {deleted_count} items.")

if __name__ == "__main__":
    clear_pycache()