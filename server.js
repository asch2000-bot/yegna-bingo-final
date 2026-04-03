const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"]
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

let games = {};

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);
  
  socket.emit("connected", { message: "Welcome to Yegna Bingo!" });
  
  socket.on("createGame", (data) => {
    const gameId = Math.random().toString(36).substr(2, 6).toUpperCase();
    games[gameId] = {
      id: gameId,
      host: socket.id,
      players: [{ id: socket.id, name: data.playerName }],
      status: "waiting",
      numbers: []
    };
    socket.join(gameId);
    socket.emit("gameCreated", { gameId });
  });
  
  socket.on("joinGame", (data) => {
    for (let gameId in games) {
      if (games[gameId].status === "waiting") {
        games[gameId].players.push({ id: socket.id, name: data.playerName });
        socket.join(gameId);
        socket.emit("gameJoined", { gameId });
        break;
      }
    }
  });
  
  socket.on("startGame", (gameId) => {
    if (games[gameId] && games[gameId].host === socket.id) {
      games[gameId].status = "active";
      io.to(gameId).emit("gameStarted");
    }
  });
  
  socket.on("callNumber", (gameId) => {
    if (games[gameId] && games[gameId].status === "active") {
      const number = Math.floor(Math.random() * 75) + 1;
      games[gameId].numbers.push(number);
      io.to(gameId).emit("numberCalled", { number });
    }
  });
  
  socket.on("bingo", (data) => {
    if (games[data.gameId]) {
      io.to(data.gameId).emit("gameEnded", { winner: data.playerName });
      delete games[data.gameId];
    }
  });
  
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});