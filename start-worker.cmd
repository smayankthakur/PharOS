@echo off
cd /d "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\apps\worker"
set DATABASE_URL=postgresql://pharos:pharos@localhost:5432/pharos
set REDIS_URL=redis://localhost:6379
set JWT_SECRET=change_me
set PORT=4000
npm run dev > "c:\Users\hp\OneDrive - Mayank Thakur\Desktop\PharOS\PharOS main\pharos\worker-dev.log" 2>&1
