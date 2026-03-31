const fetch = require("node-fetch")

async function run(){

 const r = await fetch("http://localhost:3000/health")
 console.log(await r.json())

 const p = await fetch("http://localhost:3000/price")
 console.log(await p.json())

 const s = await fetch("http://localhost:3000/signal")
 console.log(await s.json())

}

run()