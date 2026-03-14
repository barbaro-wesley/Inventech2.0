#!/bin/sh

# ─────────────────────────────────────────
# Aguarda o MinIO estar pronto
# ─────────────────────────────────────────
echo "Aguardando MinIO iniciar..."
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" 2>/dev/null; do
  echo "MinIO ainda não está pronto. Aguardando 2s..."
  sleep 2
done

echo "MinIO pronto. Criando buckets..."

# ─────────────────────────────────────────
# Cria os buckets
# ─────────────────────────────────────────
mc mb --ignore-existing local/equipment-attachments
mc mb --ignore-existing local/service-order-attachments
mc mb --ignore-existing local/invoices
mc mb --ignore-existing local/avatars
mc mb --ignore-existing local/reports

# ─────────────────────────────────────────
# Política de acesso
# Buckets privados — acesso apenas via API com URL assinada
# ─────────────────────────────────────────
mc anonymous set none local/equipment-attachments
mc anonymous set none local/service-order-attachments
mc anonymous set none local/invoices
mc anonymous set none local/avatars
mc anonymous set none local/reports

echo "Buckets criados com sucesso:"
mc ls local