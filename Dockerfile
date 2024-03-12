FROM supabase/edge-runtime:v1.40.0

COPY index.ts /app/main/index.ts

# This is the command that will be run when the container starts
ENTRYPOINT [ "edge-runtime", "start", "--main-service", "/app/main" ]