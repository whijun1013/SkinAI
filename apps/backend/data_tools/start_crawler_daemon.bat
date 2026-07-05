@echo off
echo Starting Primary Retailer Crawler Background Daemon...
start /B pythonw run_scheduler.py
echo Daemon is running in the background. You can safely close this window.
exit
