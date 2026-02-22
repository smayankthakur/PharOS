@echo off
cd /d "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\apps\api"
set DATABASE_URL=postgresql://pharos:pharos@localhost:5432/pharos
set REDIS_URL=redis://localhost:6379
set JWT_SECRET=dev_local_jwt_secret_at_least_32_chars
set SYSTEM_OWNER_KEY=dev_local_system_owner_key_at_least_32_chars
set SYSTEM_ADMIN_EMAILS=owner@shakti.test
set PORT=4000
echo START %DATE% %TIME% > "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\api-dev.log"
echo DB=%DATABASE_URL% >> "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\api-dev.log"
echo REDIS=%REDIS_URL% >> "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\api-dev.log"
npm run dev >> "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\api-dev.log" 2>&1
