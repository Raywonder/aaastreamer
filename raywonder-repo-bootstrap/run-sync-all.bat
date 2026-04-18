@echo off
setlocal
set "BASE=%~dp0"
python "%BASE%scripts\sync_all_local_repos.py" %*
