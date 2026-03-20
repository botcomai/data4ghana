@echo off
cd /d "c:\Myweb application"
git add .
git commit -m "Update site"
git push
echo.
echo ✅ Done! Your changes will be live in ~2 minutes.
echo    Visit: https://data4ghana.onrender.com
