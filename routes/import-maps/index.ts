// here "$hono" is an import map alias stored in import_map.json
// if no "import_map.json" file is present, "deno.json" will be used
import { Hono } from "$hono"

const app = new Hono().basePath('/import-maps')

app.get('/', (c) => c.text('Hello Deno!'))
app.get('/json', (c) => c.json("igogog"))

Deno.serve(app.fetch)
