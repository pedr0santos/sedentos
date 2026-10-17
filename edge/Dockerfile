# Contexto de build = raiz do repositório (Railway: RAILWAY_DOCKERFILE_PATH=edge/Dockerfile).
FROM denoland/deno:2.1.5
WORKDIR /app
COPY supabase/functions ./functions
COPY edge/main.ts ./main.ts
RUN deno cache main.ts
USER deno
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "main.ts"]
