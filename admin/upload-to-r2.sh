#!/bin/bash
# Скрипт для завантаження оброблених фото в R2
# Використання: ./upload-to-r2.sh <scene-number> <mobile.webp> <desktop.webp> <vr.jpg>

SCENE_ID=$1
MOBILE_FILE=$2
DESKTOP_FILE=$3
VR_FILE=$4

if [ -z "$SCENE_ID" ] || [ -z "$MOBILE_FILE" ] || [ -z "$DESKTOP_FILE" ] || [ -z "$VR_FILE" ]; then
    echo "Usage: ./upload-to-r2.sh <scene-number> <mobile.webp> <desktop.webp> <vr.jpg>"
    echo "Example: ./upload-to-r2.sh 13 scene-13-mobile.webp scene-13-desktop.webp scene-13-vr.jpg"
    exit 1
fi

ENDPOINT="https://61c36404c5fefc47469062825042a5d9.r2.cloudflarestorage.com"
BUCKET="warinvr-panoramas"

echo "📤 Завантаження сцени #$SCENE_ID в R2..."

# Upload mobile version
echo "  - Mobile version..."
AWS_PROFILE=r2 aws s3 cp "$MOBILE_FILE" "s3://$BUCKET/$SCENE_ID/picture/mobile.webp" \
    --endpoint-url "$ENDPOINT"

# Upload desktop version  
echo "  - Desktop version..."
AWS_PROFILE=r2 aws s3 cp "$DESKTOP_FILE" "s3://$BUCKET/$SCENE_ID/picture/desktop.webp" \
    --endpoint-url "$ENDPOINT"

# Upload VR version
echo "  - VR version..."
AWS_PROFILE=r2 aws s3 cp "$VR_FILE" "s3://$BUCKET/$SCENE_ID/picture/1.jpg" \
    --endpoint-url "$ENDPOINT"

echo "✅ Сцена #$SCENE_ID завантажена!"
echo ""
echo "🌐 URL панорами: https://pub-21040fd818d4437484f8a3c1ca05743a.r2.dev/$SCENE_ID/picture/1.jpg"
echo ""
echo "📝 Оновіть HTML для сцени $SCENE_ID якщо потрібно створити нову сторінку."
