Deno.serve((req) => {
	const params = new URL(req.url).searchParams
	const name = params.get('name')

	if (!name)
		return Response.json({ message: `please provide your name in the query, e.g. /hello?name=Alice` })

	return Response.json({ message: `Hello ${name}!` })
})
