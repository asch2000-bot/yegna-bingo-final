const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Telegram Bot Setup
const BOT_TOKEN = '8632918540:AAFvClmPVs1iiEINelqVkc3pditMwadfyl0';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Your Render URL
const RENDER_URL = 'https://yegna-bingo-final-1.onrender.com';

// Bot commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Player';
  
  bot.sendMessage(chatId, `
?? *Welcome to Yegna Bingo!* ??

Ethiopia's #1 Multiplayer Bingo Game!

*How to Play:*
1. Click the link below
2. Enter your name
3. Create or join a game
4. Mark numbers on your card
5. Get 5 in a row and shout BINGO!

?? *Play Now:* ${RENDER_URL}

Share this link with friends and play together! ????
  `, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
*Yegna Bingo Commands:*

/start - Start the game
/help - Show this help
/play - Get game link
/rules - Game rules

*Game Rules:*
• 5x5 Bingo card with random numbers
• Numbers called every 5 seconds
• Mark matching numbers
• Get 5 in a row (horizontal, vertical, or diagonal)
• Click BINGO to win!

Play now: ${RENDER_URL}
  `, { parse_mode: 'Markdown' });
});

bot.onText(/\/play/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `?? Play Yegna Bingo now: ${RENDER_URL}`);
});

bot.onText(/\/rules/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
*Yegna Bingo Rules:*

1. Each player gets a 5x5 Bingo card
2. Numbers are called randomly (1-75)
3. Mark numbers that match your card
4. Get 5 marked numbers in a row (horizontal, vertical, or diagonal)
5. Click "BINGO!" to win!

*Pro Tips:*
• The center space is FREE!
• Play with 2-10 players
• First to get BINGO wins!

Good luck! ??
  `, { parse_mode: 'Markdown' });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Game state
let games = new Map();
let players = new Map();

class Game {
  constructor(gameId, hostId, hostName) {
    this.id = gameId;
    this.hostId = hostId;
    this.players = new Map();
    this.status = 'waiting';
    this.calledNumbers = [];
    this.currentNumber = null;
    this.winner = null;
    this.started = false;
    this.numberInterval = null;
    
    this.players.set(hostId, { id: hostId, name: hostName, ready: false, isHost: true });
  }
  
  addPlayer(playerId, playerName) {
    if (this.players.size >= 10) return false;
    if (this.players.has(playerId)) return false;
    this.players.set(playerId, { id: playerId, name: playerName, ready: false, isHost: false });
    return true;
  }
  
  removePlayer(playerId) {
    this.players.delete(playerId);
    if (this.players.size === 0) return true;
    if (playerId === this.hostId && this.players.size > 0) {
      const newHost = Array.from(this.players.values())[0];
      newHost.isHost = true;
      this.hostId = newHost.id;
    }
    return false;
  }
  
  setReady(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      player.ready = true;
      return true;
    }
    return false;
  }
  
  canStart() {
    if (this.status !== 'waiting') return false;
    const players = Array.from(this.players.values());
    return players.length >= 2 && players.every(p => p.ready);
  }
  
  startGame() {
    if (!this.canStart()) return false;
    this.status = 'active';
    this.started = true;
    this.calledNumbers = [];
    this.currentNumber = null;
    this.winner = null;
    
    this.numberInterval = setInterval(() => {
      if (this.status === 'active') {
        this.callNumber();
      }
    }, 5000);
    
    return true;
  }
  
  callNumber() {
    if (this.status !== 'active') return null;
    
    const available = [];
    for (let i = 1; i <= 75; i++) {
      if (!this.calledNumbers.includes(i)) {
        available.push(i);
      }
    }
    
    if (available.length === 0) {
      this.endGame('No more numbers');
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * available.length);
    this.currentNumber = available[randomIndex];
    this.calledNumbers.push(this.currentNumber);
    
    return this.currentNumber;
  }
  
  endGame(winner) {
    this.status = 'finished';
    this.winner = winner;
    if (this.numberInterval) {
      clearInterval(this.numberInterval);
      this.numberInterval = null;
    }
  }
  
  getState() {
    return {
      id: this.id,
      status: this.status,
      started: this.started,
      players: Array.from(this.players.values()),
      calledNumbers: this.calledNumbers,
      currentNumber: this.currentNumber,
      winner: this.winner
    };
  }
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);
  
  socket.on("createGame", (data) => {
    const gameId = Math.random().toString(36).substr(2, 6).toUpperCase();
    const game = new Game(gameId, data.playerId, data.playerName);
    games.set(gameId, game);
    players.set(data.playerId, { gameId, playerId: data.playerId });
    socket.join(gameId);
    socket.emit("gameJoined", { gameId, isHost: true });
    io.to(gameId).emit("gameState", game.getState());
  });
  
  socket.on("joinGame", (data) => {
    let targetGame = null;
    for (let game of games.values()) {
      if (game.status === 'waiting' && game.players.size < 10) {
        targetGame = game;
        break;
      }
    }
    
    if (!targetGame) {
      socket.emit("error", { message: "No available games. Create one!" });
      return;
    }
    
    const success = targetGame.addPlayer(data.playerId, data.playerName);
    if (success) {
      players.set(data.playerId, { gameId: targetGame.id, playerId: data.playerId });
      socket.join(targetGame.id);
      socket.emit("gameJoined", { gameId: targetGame.id, isHost: false });
      io.to(targetGame.id).emit("gameState", targetGame.getState());
    } else {
      socket.emit("error", { message: "Failed to join game" });
    }
  });
  
  socket.on("playerReady", (data) => {
    const game = games.get(data.gameId);
    if (game) {
      game.setReady(data.playerId);
      io.to(data.gameId).emit("gameState", game.getState());
    }
  });
  
  socket.on("startGame", (data) => {
    const game = games.get(data.gameId);
    if (game && game.hostId === data.playerId) {
      game.startGame();
      io.to(data.gameId).emit("gameState", game.getState());
      io.to(data.gameId).emit("gameStarted");
    }
  });
  
  socket.on("callNumber", (data) => {
    const game = games.get(data.gameId);
    if (game && game.hostId === data.playerId && game.status === 'active') {
      const number = game.callNumber();
      if (number) {
        io.to(data.gameId).emit("numberCalled", { number });
        io.to(data.gameId).emit("gameState", game.getState());
      }
    }
  });
  
  socket.on("bingo", (data) => {
    const game = games.get(data.gameId);
    if (game && game.status === 'active') {
      game.endGame(data.playerName);
      io.to(data.gameId).emit("gameEnded", { winner: data.playerName });
      io.to(data.gameId).emit("gameState", game.getState());
      
      // Send notification to Telegram
      bot.sendMessage(process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID', `?? BINGO! ${data.playerName} won the game! ??\n\nPlay again: ${RENDER_URL}`);
    }
  });
  
  socket.on("markNumber", (data) => {
    io.to(data.gameId).emit("numberMarked", data);
  });
  
  socket.on("leaveGame", (data) => {
    const game = games.get(data.gameId);
    if (game) {
      const shouldDelete = game.removePlayer(data.playerId);
      if (shouldDelete) {
        games.delete(data.gameId);
      } else {
        io.to(data.gameId).emit("gameState", game.getState());
      }
    }
    players.delete(data.playerId);
    socket.leave(data.gameId);
  });
  
  socket.on("disconnect", () => {
    const playerData = players.get(socket.id);
    if (playerData) {
      const game = games.get(playerData.gameId);
      if (game) {
        const shouldDelete = game.removePlayer(socket.id);
        if (shouldDelete) {
          games.delete(playerData.gameId);
        } else {
          io.to(playerData.gameId).emit("gameState", game.getState());
        }
      }
      players.delete(socket.id);
    }
    console.log("Player disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
  console.log("Telegram bot is active!");
});
