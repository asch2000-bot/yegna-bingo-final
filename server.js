const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"]
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ============ HEALTH CHECK FOR RENDER ============
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============ DATA FILES SETUP ============
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const usersFile = path.join(dataDir, "users.json");
const gamesFile = path.join(dataDir, "games.json");
const depositsFile = path.join(dataDir, "deposits.json");
const withdrawalsFile = path.join(dataDir, "withdrawals.json");

// Initialize files if they don't exist
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, "{}");
if (!fs.existsSync(gamesFile)) fs.writeFileSync(gamesFile, "{}");
if (!fs.existsSync(depositsFile)) fs.writeFileSync(depositsFile, "[]");
if (!fs.existsSync(withdrawalsFile)) fs.writeFileSync(withdrawalsFile, "[]");

// Load data
let users = {};
let games = {};
let deposits = [];
let withdrawals = [];

function loadData() {
  try { users = JSON.parse(fs.readFileSync(usersFile)); } catch(e) { users = {}; }
  try { games = JSON.parse(fs.readFileSync(gamesFile)); } catch(e) { games = {}; }
  try { deposits = JSON.parse(fs.readFileSync(depositsFile)); } catch(e) { deposits = []; }
  try { withdrawals = JSON.parse(fs.readFileSync(withdrawalsFile)); } catch(e) { withdrawals = []; }
}

function saveUsers() { fs.writeFileSync(usersFile, JSON.stringify(users, null, 2)); }
function saveGames() { fs.writeFileSync(gamesFile, JSON.stringify(games, null, 2)); }
function saveDeposits() { fs.writeFileSync(depositsFile, JSON.stringify(deposits, null, 2)); }
function saveWithdrawals() { fs.writeFileSync(withdrawalsFile, JSON.stringify(withdrawals, null, 2)); }

loadData();

// ============ GAME CLASS ============
class BingoGame {
  constructor(gameId, hostId) {
    this.id = gameId;
    this.hostId = hostId;
    this.players = [];
    this.status = "waiting";
    this.maxPlayers = 300;
    this.bettingAmount = 0;
    this.winningNumbers = [];
    this.calledNumbers = [];
    this.currentNumber = null;
    this.winner = null;
    this.createdAt = Date.now();
  }
  
  addPlayer(user) {
    if (this.players.length >= this.maxPlayers) return false;
    if (this.players.find(p => p.id === user.id)) return false;
    this.players.push({
      id: user.id,
      name: user.name,
      phone: user.phone,
      chosenNumbers: [],
      hasPlayed: false,
      joinedAt: Date.now()
    });
    return true;
  }
  
  setPlayerNumbers(userId, numbers) {
    const player = this.players.find(p => p.id === userId);
    if (player && numbers.length >= 1 && numbers.length <= 3) {
      player.chosenNumbers = numbers;
      player.betAmount = numbers.length * 10;
      return true;
    }
    return false;
  }
  
  callNumber() {
    if (this.status !== "active") return null;
    const available = [];
    for (let i = 1; i <= 75; i++) {
      if (!this.calledNumbers.includes(i)) available.push(i);
    }
    if (available.length === 0) return null;
    const number = available[Math.floor(Math.random() * available.length)];
    this.calledNumbers.push(number);
    this.currentNumber = number;
    
    for (let player of this.players) {
      if (player.chosenNumbers.includes(number) && !player.hasPlayed) {
        player.hasPlayed = true;
        this.winner = player;
        this.status = "finished";
        
        const user = users[player.id];
        if (user) {
          const winnings = player.chosenNumbers.length * 50;
          user.balance += winnings;
          user.gamesWon = (user.gamesWon || 0) + 1;
          saveUsers();
        }
        return number;
      }
    }
    return number;
  }
  
  getState() {
    return {
      id: this.id,
      status: this.status,
      players: this.players.map(p => ({ 
        name: p.name, 
        chosenNumbers: p.chosenNumbers, 
        hasPlayed: p.hasPlayed 
      })),
      calledNumbers: this.calledNumbers,
      currentNumber: this.currentNumber,
      winner: this.winner,
      maxPlayers: this.maxPlayers
    };
  }
}

// ============ API ROUTES ============

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Mini App registration - NO TOKEN NEEDED!
app.post("/api/register-miniapp", (req, res) => {
  const { phone, name, telegramId } = req.body;
  loadData();
  
  if (!phone || !name) {
    return res.json({ error: "Phone and name are required" });
  }
  
  const existingUser = Object.values(users).find(u => u.phone === phone);
  
  if (existingUser) {
    existingUser.telegramId = telegramId;
    existingUser.name = name;
    saveUsers();
    res.json({ success: true, userId: existingUser.id, balance: existingUser.balance });
  } else {
    const userId = require("crypto").randomBytes(16).toString("hex");
    users[userId] = {
      id: userId,
      name: name,
      phone: phone,
      telegramId: telegramId,
      balance: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      registeredAt: Date.now()
    };
    saveUsers();
    res.json({ success: true, userId, balance: 0 });
  }
});

// Get user by phone
app.get("/api/user/:phone", (req, res) => {
  loadData();
  const user = Object.values(users).find(u => u.phone === req.params.phone);
  if (user) {
    res.json({
      id: user.id,
      name: user.name,
      phone: user.phone,
      balance: user.balance,
      gamesPlayed: user.gamesPlayed || 0,
      gamesWon: user.gamesWon || 0
    });
  } else {
    res.json(null);
  }
});

// Get user by telegram ID
app.get("/api/user/telegram/:telegramId", (req, res) => {
  loadData();
  const user = Object.values(users).find(u => u.telegramId === req.params.telegramId);
  if (user) {
    res.json({
      id: user.id,
      name: user.name,
      phone: user.phone,
      balance: user.balance,
      gamesPlayed: user.gamesPlayed || 0,
      gamesWon: user.gamesWon || 0
    });
  } else {
    res.json(null);
  }
});

// Game routes
app.get("/api/games/active", (req, res) => {
  loadData();
  const activeGames = Object.values(games).filter(g => g.status === "waiting");
  res.json(activeGames.map(g => ({ 
    id: g.id, 
    playerCount: g.players.length, 
    maxPlayers: g.maxPlayers 
  })));
});

app.post("/api/game/create", (req, res) => {
  const { hostId } = req.body;
  loadData();
  const gameId = Math.random().toString(36).substr(2, 6).toUpperCase();
  games[gameId] = new BingoGame(gameId, hostId);
  saveGames();
  res.json({ success: true, gameId });
});

app.post("/api/game/join", (req, res) => {
  const { gameId, userId } = req.body;
  loadData();
  const game = games[gameId];
  const user = users[userId];
  
  if (game && user && game.addPlayer(user)) {
    saveGames();
    res.json({ success: true });
  } else {
    res.json({ error: "Cannot join game" });
  }
});

app.post("/api/game/choose-numbers", (req, res) => {
  const { gameId, userId, numbers } = req.body;
  loadData();
  const game = games[gameId];
  const user = users[userId];
  
  if (game && user) {
    const totalCost = numbers.length * 10;
    if (user.balance >= totalCost) {
      user.balance -= totalCost;
      user.gamesPlayed = (user.gamesPlayed || 0) + 1;
      game.setPlayerNumbers(userId, numbers);
      saveUsers();
      saveGames();
      res.json({ success: true, newBalance: user.balance });
    } else {
      res.json({ error: "Insufficient balance" });
    }
  } else {
    res.json({ error: "Invalid game or user" });
  }
});

// ============ ADMIN API ENDPOINTS ============

app.get("/api/admin/data", (req, res) => {
  loadData();
  
  const pendingDeposits = deposits.filter(d => d.status === "pending");
  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending");
  const totalBalance = Object.values(users).reduce((sum, u) => sum + (u.balance || 0), 0);
  
  res.json({
    totalUsers: Object.keys(users).length,
    totalBalance: totalBalance,
    pendingDeposits: pendingDeposits.length,
    pendingWithdrawals: pendingWithdrawals.length,
    deposits: pendingDeposits,
    withdrawals: pendingWithdrawals,
    users: Object.values(users).map(u => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      balance: u.balance,
      gamesPlayed: u.gamesPlayed || 0,
      gamesWon: u.gamesWon || 0
    }))
  });
});

app.post("/api/admin/approve-deposit", (req, res) => {
  const { id } = req.body;
  loadData();
  
  const deposit = deposits.find(d => d.id === id);
  if (deposit && deposit.status === "pending") {
    deposit.status = "approved";
    deposit.approvedAt = Date.now();
    
    const user = users[deposit.userId];
    if (user) {
      user.balance += deposit.amount;
      saveUsers();
    }
    saveDeposits();
    res.json({ success: true });
  } else {
    res.json({ error: "Deposit not found" });
  }
});

app.post("/api/admin/reject-deposit", (req, res) => {
  const { id } = req.body;
  loadData();
  
  const deposit = deposits.find(d => d.id === id);
  if (deposit) {
    deposit.status = "rejected";
    saveDeposits();
    res.json({ success: true });
  } else {
    res.json({ error: "Deposit not found" });
  }
});

app.post("/api/admin/approve-withdraw", (req, res) => {
  const { id } = req.body;
  loadData();
  
  const withdrawal = withdrawals.find(w => w.id === id);
  if (withdrawal && withdrawal.status === "pending") {
    const user = users[withdrawal.userId];
    if (user && user.balance >= withdrawal.amount) {
      user.balance -= withdrawal.amount;
      withdrawal.status = "completed";
      withdrawal.completedAt = Date.now();
      
      saveUsers();
      saveWithdrawals();
      res.json({ success: true });
    } else {
      res.json({ error: "Insufficient balance" });
    }
  } else {
    res.json({ error: "Withdrawal not found" });
  }
});

app.post("/api/admin/reject-withdraw", (req, res) => {
  const { id } = req.body;
  loadData();
  
  const withdrawal = withdrawals.find(w => w.id === id);
  if (withdrawal) {
    withdrawal.status = "rejected";
    saveWithdrawals();
    res.json({ success: true });
  } else {
    res.json({ error: "Withdrawal not found" });
  }
});

app.post("/api/admin/adjust-balance", (req, res) => {
  const { phone, amount, type } = req.body;
  loadData();
  
  const user = Object.values(users).find(u => u.phone === phone);
  if (user) {
    if (type === "add") {
      user.balance += amount;
    } else {
      user.balance -= amount;
    }
    saveUsers();
    res.json({ success: true, newBalance: user.balance });
  } else {
    res.json({ error: "User not found" });
  }
});

app.get("/api/admin/user/:phone", (req, res) => {
  loadData();
  const user = Object.values(users).find(u => u.phone === req.params.phone);
  res.json(user || null);
});

// ============ SOCKET.IO ============

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);
  
  socket.on("joinGameRoom", (gameId) => {
    socket.join(gameId);
    const game = games[gameId];
    if (game) socket.emit("gameState", game.getState());
  });
  
  socket.on("startGame", (gameId) => {
    const game = games[gameId];
    if (game && game.status === "waiting" && game.players.length >= 2) {
      game.status = "active";
      io.to(gameId).emit("gameStarted");
      io.to(gameId).emit("gameState", game.getState());
      
      const interval = setInterval(() => {
        const currentGame = games[gameId];
        if (currentGame && currentGame.status === "active") {
          const number = currentGame.callNumber();
          io.to(gameId).emit("numberCalled", { 
            number, 
            allNumbers: currentGame.calledNumbers 
          });
          io.to(gameId).emit("gameState", currentGame.getState());
          
          if (currentGame.winner) {
            clearInterval(interval);
            io.to(gameId).emit("gameEnded", { winner: currentGame.winner.name });
            setTimeout(() => delete games[gameId], 60000);
          }
        } else {
          clearInterval(interval);
        }
      }, 3000);
    }
  });
  
  socket.on("callNumber", (gameId) => {
    const game = games[gameId];
    if (game && game.status === "active") {
      const number = game.callNumber();
      io.to(gameId).emit("numberCalled", { number, allNumbers: game.calledNumbers });
      io.to(gameId).emit("gameState", game.getState());
      
      if (game.winner) {
        io.to(gameId).emit("gameEnded", { winner: game.winner.name });
        setTimeout(() => delete games[gameId], 60000);
      }
    }
  });
  
  socket.on("bingo", (data) => {
    const game = games[data.gameId];
    if (game && game.status === "active") {
      game.endGame(data.playerName);
      io.to(data.gameId).emit("gameEnded", { winner: data.playerName });
      io.to(data.gameId).emit("gameState", game.getState());
    }
  });
  
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
  });
});

// ============ START SERVER - FIXED FOR RENDER ============
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Game URL: http://localhost:${PORT}`);
  console.log(`📍 Admin URL: http://localhost:${PORT}/admin`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Mini App ready - No token required!`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});