@echo off
setlocal
set "BASE=%~dp0"
python "%BASE%scripts\enroll_raywonder_repos.py"
