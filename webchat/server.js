const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3000;

let users = {};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinRoom', (filter) => {
    filter = sanitizeInput(filter);
    let foundRoom = false;
    for (const [id, user] of Object.entries(users)) {
      if (user.filter === filter && user.status === 'waiting' && id !== socket.id) {
        users[id].status = 'matched';
        users[socket.id] = { filter: filter, status: 'matched', matchedUser: id };
        users[id].matchedUser = socket.id;
        socket.emit('matched', id);
        io.to(id).emit('matched', socket.id);
        foundRoom = true;
        break;
      }
    }

    if (!foundRoom) {
      users[socket.id] = { filter: filter, status: 'waiting', matchedUser: null };
    }
  });

  socket.on('signal', (data) => {
    data.signal = sanitizeInput(data.signal);
    io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });

  socket.on('message', (message) => {
    message = sanitizeInput(message);
    const matchedUser = users[socket.id]?.matchedUser;
    if (matchedUser) {
      io.to(matchedUser).emit('message', message);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    const matchedUser = users[socket.id]?.matchedUser;
    if (matchedUser) {
      io.to(matchedUser).emit('disconnect');
      users[matchedUser].status = 'waiting';
      users[matchedUser].matchedUser = null;
    }
    delete users[socket.id];
  });

  // Manejador del evento 'report'
  socket.on('report', (data) => {
    data.reason = sanitizeInput(data.reason);
    console.log(`User ${socket.id} reported user ${data.reportedUser} for reason: ${data.reason}`);
    io.to(data.reportedUser).emit('reportAcknowledged');
  });
});

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

function sanitizeInput(input) {
  // Add more sanitization logic as needed
  if (typeof input === 'string') {
    return input.replace(/[<>]/g, '');
  }
  return input;
}
