# Schoolwork Hub

Schoolwork Hub is a PC and Android-ready school organization app with assignments, classes, grades, focus tools, XP, rewards, achievements, and device-local storage.

## PC

Run `npm install`, then `npm run dist`. The Windows installer is created in `dist/`.

## Android

Open `phone-project/` in Android Studio. Build with **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The debug APK is created at `phone-project/app/build/outputs/apk/debug/app-debug.apk`.

## GitHub

Create a new GitHub repository, then run:

```powershell
git init
git add .
git commit -m "Initial Schoolwork Hub release"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Do not commit `node_modules`, `dist`, APKs, or Android build folders. They are excluded by `.gitignore`.
