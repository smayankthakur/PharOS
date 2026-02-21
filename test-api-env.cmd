@echo off
cd /d "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\apps\api"
set DATABASE_URL=postgresql://pharos:pharos@localhost:5432/pharos
set REDIS_URL=redis://localhost:6379
set JWT_SECRET=change_me
set PORT=4000
echo DB=%DATABASE_URL% > "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\envcheck.txt"
echo REDIS=%REDIS_URL% >> "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\envcheck.txt"
echo JWT=%JWT_SECRET% >> "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\envcheck.txt"
node -e "console.log(process.env.DATABASE_URL, process.env.REDIS_URL, process.env.JWT_SECRET)" >> "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\envcheck.txt" 2>&1
