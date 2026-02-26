#!/bin/bash

# 🚀 War in VR - Auto Git Setup Script
# Цей скрипт автоматично ініціалізує Git та підготує до push на GitHub

set -e  # Зупинитись при помилці

echo "🎮 War in VR - Git Setup"
echo "========================"
echo ""

# Перевірка чи ми в правильній директорії
if [ ! -f "index.html" ] || [ ! -d "admin" ]; then
    echo "❌ Помилка: Запустіть скрипт з папки war-in-vr!"
    echo "   cd /Users/alex/Documents/GitHub/war-in-vr"
    exit 1
fi

echo "✅ Знайдено проєкт War in VR"
echo ""

# Перевірка чи Git встановлений
if ! command -v git &> /dev/null; then
    echo "❌ Git не встановлений!"
    echo "   Встановіть Git: https://git-scm.com/download/mac"
    exit 1
fi

echo "✅ Git встановлений: $(git --version)"
echo ""

# Налаштування Git username та email (якщо не налаштовані)
if [ -z "$(git config --global user.name)" ]; then
    echo "📝 Налаштування Git користувача..."
    read -p "Введіть ваше ім'я: " git_name
    git config --global user.name "$git_name"
    echo "✅ Ім'я встановлено: $git_name"
else
    echo "✅ Git user: $(git config --global user.name)"
fi

if [ -z "$(git config --global user.email)" ]; then
    read -p "Введіть ваш email: " git_email
    git config --global user.email "$git_email"
    echo "✅ Email встановлено: $git_email"
else
    echo "✅ Git email: $(git config --global user.email)"
fi

echo ""

# Ініціалізація Git (якщо ще не ініціалізований)
if [ ! -d ".git" ]; then
    echo "🔧 Ініціалізація Git репозиторію..."
    git init
    echo "✅ Git ініціалізовано"
else
    echo "✅ Git вже ініціалізований"
fi

echo ""

# Додавання файлів
echo "📦 Додавання файлів до Git..."
git add .
echo "✅ Файли додані"

echo ""

# Commit
echo "💾 Створення commit..."
git commit -m "Initial commit: War in VR project with admin panel

- 11 VR scenes with 360° panoramas
- A-Frame WebVR framework
- Admin panel with browser-based image processing
- Cloudflare Pages ready
- R2 Storage integration prepared"

echo "✅ Commit створено"

echo ""
echo "🎉 Локальний Git репозиторій готовий!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 НАСТУПНІ КРОКИ:"
echo ""
echo "1️⃣  Створіть репозиторій на GitHub:"
echo "   https://github.com/new"
echo ""
echo "2️⃣  Скопіюйте URL вашого репозиторію"
echo "   (наприклад: https://github.com/USERNAME/war-in-vr.git)"
echo ""
echo "3️⃣  Виконайте ці команди:"
echo ""
echo "   git remote add origin YOUR_GITHUB_URL"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Після push:"
echo "   → Зайдіть на pages.cloudflare.com"
echo "   → Create project → Connect to Git"
echo "   → Виберіть war-in-vr"
echo "   → Deploy!"
echo ""
echo "🔗 Детальна інструкція: GITHUB_SETUP.md"
echo ""
