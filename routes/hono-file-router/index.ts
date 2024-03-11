import { Hono } from "https://deno.land/x/hono@v4.0.10/mod.ts"

const app = new Hono().basePath('/hono-file-router')

app.get('/text', (c) => c.text('Hello Deno!'))

Deno.serve(app.fetch)
