@echo off
cd /d "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\apps\api"
set DATABASE_URL=postgresql://pharos:pharos@localhost:5432/pharos
set REDIS_URL=redis://localhost:6379
set JWT_SECRET=dev_local_jwt_secret_at_least_32_chars
set SYSTEM_OWNER_KEY=dev_local_system_owner_key_at_least_32_chars
set SYSTEM_ADMIN_EMAILS=owner@shakti.test
set PORT=4000
echo DB=%DATABASE_URL% > "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\envcheck.txt"
echo REDIS=%REDIS_URL% >> "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\envcheck.txt"
node -e "console.log(process.env.DATABASE_URL, process.env.REDIS_URL, 'JWT_SET')" >> "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\envcheck.txt" 2>&1
