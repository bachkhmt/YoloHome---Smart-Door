# YoloHome + Face‑Recognizer — justfile
#   just setup   — first-time: create .env, start MySQL, apply schema
#   just run     — start both servers
#   just db      — MySQL only

default:
    @just --list

# Full setup: MySQL + face-recognizer + Node server
run:
    bash run.sh run

# First-time setup: creates .env, starts MySQL, applies schema
setup:
    bash run.sh setup

# Start MySQL only (useful when running servers separately)
db:
    bash run.sh db
