const clients = new Set();

function register(ws){

  clients.add(ws);

  ws.on("close", ()=>{
    clients.delete(ws);
  });

}

function broadcast(data){

  const payload = JSON.stringify(data);

  for(const client of clients){

    if(client.readyState === 1){
      client.send(payload);
    }

  }

}

module.exports = {register,broadcast};