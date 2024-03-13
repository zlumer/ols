import git from "https://esm.sh/isomorphic-git@1.25.6"
import gitHttp from 'https://unpkg.com/isomorphic-git@1.25.6/http/web/index.js'
import * as fsDir from "https://deno.land/std@0.218.2/fs/exists.ts"
import * as path from "https://deno.land/std@0.218.2/path/join.ts"
import * as fs from "node:fs"

console.log('OLS: starting...')

const DEFAULTS = {
	OLS_DEV_MODE: "",
	OLS_WORKERS_ROOT: "/",
	OLS_BRANCH_NAME: "master",
	OLS_INSTANCE_NAME: "", // TODO
	OLS_API_KEY: "",
	OLS_POLLING_INTERVAL: "65",
	OLS_UPDATE_WEBHOOK_URL: "", // TODO
}

const ENV = {
	...DEFAULTS,
	...pick(Deno.env.toObject(), Object.keys(DEFAULTS)),

	path: Deno.env.get("OLS_REPO"),
}

const REPO_DIR = "/app/repo/green"
const DEV_DIR = "/app/workdir"

function workerRoot()
{
	let dir = ENV.OLS_DEV_MODE ? DEV_DIR : REPO_DIR
	return path.join(dir, ENV.OLS_WORKERS_ROOT)
}

/*
	Two separate instances should absolutely never share the same git directory.
	If they do, they will interfere with each other and cause corruption.
	To avoid this, consider one of two options:
	1. Don't mount git repo directory into the docker container. Let the temp file system handle it.
	2. If your repository has a very long checkout process, use a separate docker volume for each instance.
*/

const GIT_STATUS = {
	status: "updating" as "updating" | "ready",
	onFinish: null as Promise<void> | null,
	async update()
	{
		if (this.status == "updating")
			await this.onFinish
		else
			this.onFinish = this._update()
	},
	async _update()
	{
		this.status = "updating"
		this.WORKER_CACHE.clear()
		try
		{
			await git_pull(REPO_DIR, ENV.OLS_BRANCH_NAME)
		}
		catch (e)
		{
			console.error(`failed to pull:`, e)
		}
		this.status = "ready"
	},
	async waitForReady()
	{
		if (this.status == "updating")
			await this.onFinish
	},
	WORKER_CACHE: new Map<string, { importMap: string | null }>(),
	getCachedWorker(worker: string)
	{
		if (ENV.OLS_DEV_MODE)
			return undefined

		return this.WORKER_CACHE.get(worker)
	},
	cacheWorker(worker: string, params: { importMap: string | null })
	{
		this.WORKER_CACHE.set(worker, params)
	}
}

// start watching files
await __init()

async function __init()
{
	if (ENV.OLS_DEV_MODE)
	{
		console.log(`OLS: DEVELOPMENT MODE ENABLED`)
		
		if (ENV.path)
			throw die(`Using both OLS_REPO and OLS_DEV_MODE is not supported!\n`
				+ `Use OLS_DEV_MODE for local development and OLS_REPO for production.`)

		// check if the directory exists at all (i.e. is mounted)
		// if it's not mounted, we won't be able to launch
		if (!await fsDir.exists(DEV_DIR, { isDirectory: true }))
			throw die(`dev worker directory ${DEV_DIR} is not mounted!`)

		// check if the worker root contains any files
		// if no files found, maybe the root is incorrect but also maybe the user
		// have not created any routes yet, so no exception throwing here
		if (await isDirEmpty(workerRoot()))
			console.error(`OLS: WARNING dev worker directory "${ENV.OLS_WORKERS_ROOT}" is empty!`
				+` Make sure you passed the correct volume to the container and`
				+` the OLS_WORKERS_ROOT env variable is set correctly.`
			)

		// watchDevDir(DEV_DIR)
	}
	else
	{
		if (!ENV.path)
			throw die(`worker repository is not provided! set OLS_REPO env variable, e.g.\n  OLS_REPO=https://github.com/zlumer/ols.git`)
		
		console.log(`starting OLS in PRODUCTION mode with ${ENV.path}`)
		await ensureGitRepo(ENV.path, REPO_DIR, ENV.OLS_BRANCH_NAME)
		await pollForUpdates()
	}
	console.log(`OLS: READY`)
}

function pick<T, K extends keyof T>(obj: T, fields: K[]): Pick<T, K>
{
	let result = {} as Pick<T, K>
	for (let key of fields)
		if (key in (obj as {}))
			result[key] = obj[key]
	return result
}

function die(msg: string)
{
	console.error(`\nERROR: ${msg}\n`)
	return new Error(`FAILED TO LAUNCH, PLEASE FIX THE PROBLEM ABOVE AND RESTART`)
}

async function isDirEmpty(dir: string)
{
	const exists = await fsDir.exists(dir, { isDirectory: true })
	if (!exists)
		return true

	const files = Deno.readDir(dir)
	for await (const _file of files)
		return false
	
	return true
}

async function pollForUpdates()
{
	await updateIfNeeded()

	setTimeout(pollForUpdates, parseInt(ENV.OLS_POLLING_INTERVAL) * 1000)
}

async function getRefStatus()
{
	let local = await git.resolveRef({ fs, dir: REPO_DIR, ref: ENV.OLS_BRANCH_NAME })
	let remote = await git.resolveRef({ fs, dir: REPO_DIR, ref: `origin/${ENV.OLS_BRANCH_NAME}` })
	return {
		local,
		remote,
		canPull: local != remote,
	}
}

async function updateIfNeeded()
{
	await GIT_STATUS.waitForReady()
	try
	{
		await git_fetch(REPO_DIR, ENV.OLS_BRANCH_NAME)
	}
	catch (e)
	{
		console.error(`failed to fetch:`, e)
		return
	}
	let refs = await getRefStatus()
	// console.log(refs)
	if (refs.canPull)
		await GIT_STATUS.update()
}

async function ensureGitRepo(url: string, mountDir: string, branch: string = "master")
{
	let exists = fsDir.existsSync(mountDir)
	let isDir = exists && Deno.lstatSync(mountDir).isDirectory
	let hasGitDir = isDir && fsDir.existsSync(path.join(mountDir, ".git"))
	let isEmpty = isDir && isDirEmpty(mountDir)
	if (exists && !hasGitDir && !isEmpty)
		throw new Error(`dir ${mountDir} is not empty and not a .git directory!`)

	if (!exists)
	{
		await git_clone(url, mountDir, branch)
		// await git.checkout({ fs, dir: mountDir, force: true, ref: "55dc5e612bde9178792ea60df00642a7541ba6f3" })
	}
	else if (hasGitDir)
	{
		await git_fetch(mountDir, branch)
	}
	// console.log(`dir: ${mountDir}, exists: ${exists}, isDir: ${isDir}, hasGitDir: ${hasGitDir}`)

	GIT_STATUS.status = "ready"
	// console.log(`git is ready!`)
	// console.log(Deno.readDirSync(mountDir))
}
async function git_clone(url: string, mountDir: string, branch: string)
{
	// console.log(`cloning... (to ${mountDir})`)
	Deno.mkdirSync(mountDir, { recursive: true })
	return git.clone({
		fs,
		http: gitHttp,
		dir: mountDir,
		url,
		singleBranch: true,
		ref: branch,
		depth: 1
	})
}
async function git_fetch(mountDir: string, branch: string)
{
	// console.log(`fetching... (from ${mountDir})`)
	return git.fetch({
		fs,
		http: gitHttp,
		dir: mountDir,
		ref: branch,
		remoteRef: `refs/heads/${branch}`,
		singleBranch: true,
		depth: 1
	})
}
function git_pull(mountDir: string, branch: string)
{
	// console.log(`pulling... (from ${mountDir})`)
	return git.pull({
		fs,
		http: gitHttp,
		author: {
			name: ENV.OLS_INSTANCE_NAME || "ols",
			email: "ols@example.org"
		},
		fastForwardOnly: true,
		dir: mountDir,
		singleBranch: true,
		ref: branch,
		remoteRef: `refs/heads/${branch}`,
	})
}
async function detectImportMapFile(dir: string)
{
	let importMapPath = path.join(dir, 'import_map.json')
	if (await fsDir.exists(importMapPath))
		return importMapPath

	let denoPath = path.join(dir, 'deno.json')
	if (await fsDir.exists(denoPath))
	{
		let denoJson = JSON.parse(await Deno.readTextFile(denoPath))
		if (denoJson.imports)
			return denoPath
	}

	return null
}

Deno.serve(async (req: Request) => {
	const url = new URL(req.url)
	const { pathname } = url

	// handle health checks
	if (pathname === '/_internal/health')
		return Response.json({ 'message': 'ok' }, { status: 200 })

	if (pathname === '/_internal/metric') {
		const metric = await EdgeRuntime.getRuntimeMetrics()
		return Response.json(metric)
	}

	if (pathname.startsWith("/_internal/api")) {
		if (!ENV.OLS_API_KEY)
			return Response.json({ message: "not found" }, { status: 404 })
		
		if (url.searchParams.get("key") !== ENV.OLS_API_KEY)
			return Response.json({ message: "invalid api key" }, { status: 403 })

		const [_, _internal, _api, method, ...params] = pathname.split('/')
		if (method == "status")
			return Response.json({
				status: ENV.OLS_DEV_MODE ? {
					mode: "dev"
				} : {
					mode: "production",
					commit: (await getRefStatus()).local,
				},
				env: pick(ENV, ["OLS_BRANCH_NAME", "OLS_WORKERS_ROOT", "OLS_INSTANCE_NAME", "OLS_POLLING_INTERVAL"])
			})
	}

	await GIT_STATUS.waitForReady()

	// NOTE: You can test WebSocket in the main worker by uncommenting below.
	// if (pathname === '/_internal/ws') {
	// 	const upgrade = req.headers.get("upgrade") || ""

	// 	if (upgrade.toLowerCase() != "websocket") {
	// 		return new Response("request isn't trying to upgrade to websocket.")
	// 	}
	
	// 	const { socket, response } = Deno.upgradeWebSocket(req)
	
	// 	socket.onopen = () => console.log("socket opened")
	// 	socket.onmessage = (e) => {
	// 		console.log("socket message:", e.data)
	// 		socket.send(new Date().toString())
	// 	}
	
	// 	socket.onerror = e => console.log("socket errored:", e.message)
	// 	socket.onclose = () => console.log("socket closed")
	
	// 	return response // 101 (Switching Protocols)
	// }

	const path_parts = pathname.split('/')
	const service_name = path_parts[1]

	if (!service_name)
		return Response.json({ msg: 'missing function name in request' }, { status: 400 })

	const servicePath = path.join(workerRoot(), service_name)
	// console.error(`serving the request with ${servicePath}`)
	const maybeEntrypoint = `file://${servicePath}/index.ts`

	if (!await fsDir.exists(servicePath))
		return Response.json({ msg: 'not found' }, { status: 404 })

	const createWorker = async () => {
		const memoryLimitMb = 150
		const workerTimeoutMs = 5 * 60 * 1000
		const noModuleCache = false

		// you can provide an import map inline
		// const inlineImportMap = {
		//   imports: {
		//     "std/": "https://deno.land/std@0.131.0/",
		//     "cors": "./examples/_shared/cors.ts"
		//   }
		// }
		// const importMapPath = `data:${encodeURIComponent(JSON.stringify(importMap))}?${encodeURIComponent('/home/deno/functions/test')}`
		const cachedWorker = GIT_STATUS.getCachedWorker(service_name)
		const importMapPath: string | null = cachedWorker ? cachedWorker.importMap : await detectImportMapFile(servicePath)
		
		const envVarsObj = Deno.env.toObject()
		const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]])
		const forceCreate = !cachedWorker
		const netAccessDisabled = false

		GIT_STATUS.cacheWorker(service_name, { importMap: importMapPath })

		// load source from an eszip
		//const maybeEszip = await Deno.readFile('./bin.eszip')
		//const maybeEntrypoint = 'file:///src/index.ts'

		// const maybeEntrypoint = 'file:///src/index.ts'
		// or load module source from an inline module
		// const maybeModuleCode = 'Deno.serve((req) => new Response("Hello from Module Code"))'
		//
		const cpuTimeSoftLimitMs = 10000
		const cpuTimeHardLimitMs = 20000

		return await EdgeRuntime.userWorkers.create({
			servicePath,
			memoryLimitMb,
			workerTimeoutMs,
			noModuleCache,
			importMapPath,
			envVars,
			forceCreate,
			netAccessDisabled,
			cpuTimeSoftLimitMs,
			cpuTimeHardLimitMs,
			// maybeEszip,
			maybeEntrypoint,
			// maybeModuleCode,
		})
	}

	const callWorker = async () => {
		try {
			// If a worker for the given service path already exists,
			// it will be reused by default.
			// Update forceCreate option in createWorker to force create a new worker for each request.
			const worker = await createWorker()
			const controller = new AbortController()

			const signal = controller.signal
			// Optional: abort the request after a timeout
			//setTimeout(() => controller.abort(), 2 * 60 * 1000)

			return await worker.fetch(req, { signal })
		} catch (e) {
			console.error(e)

			if (e instanceof Deno.errors.WorkerRequestCancelled) {
				// XXX(Nyannyacha): I can't think right now how to re-poll
				// inside the worker pool without exposing the error to the
				// surface.

				// It is satisfied when the supervisor that handled the original
				// request terminated due to reaches such as CPU time limit or
				// Wall-clock limit.
				//
				// The current request to the worker has been canceled due to
				// some internal reasons. We should repoll the worker and call
				// `fetch` again.
				// return await callWorker()
				console.log('cancelled!')
			}

			const error = { msg: e.toString() }
			return Response.json(error, { status: 500 })
		}
	}

	return callWorker()
})
