import { join } from 'path';
import express from 'express';
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
const app = express();
const server = new http.Server(app);
const io = new Server(server);
import { version, validate } from 'uuid';
import ACTIONS from './actions.js';
 const PORT = process.env.PORT || 3001;

 io.on("connection", (socket) => {
  console.log('connect')
});
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
function getClientRooms() {
  const {rooms} = io.sockets.adapter;

  return Array.from(rooms.keys()).filter(roomID => validate(roomID) && version(roomID) === 4);
}

function shareRoomsInfo() {
  io.emit(ACTIONS.SHARE_ROOMS, {
    rooms: getClientRooms()
  })
}

io.on('connection', socket => {
  shareRoomsInfo();

  socket.on(ACTIONS.JOIN, config => {
    const {room: roomID} = config;
    const {rooms: joinedRooms} = socket;

    if (Array.from(joinedRooms).includes(roomID)) {
      return console.warn(`Already joined to ${roomID}`);
    }

    const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || []);

    clients.forEach(clientID => {
      io.to(clientID).emit(ACTIONS.ADD_PEER, {
        peerID: socket.id,
        createOffer: false
      });

      socket.emit(ACTIONS.ADD_PEER, {
        peerID: clientID,
        createOffer: true,
      });
    });

    socket.join(roomID);
    shareRoomsInfo();
  });

  function leaveRoom() {
    const {rooms} = socket;

    Array.from(rooms)
      // LEAVE ONLY CLIENT CREATED ROOM
      .filter(roomID => validate(roomID) && version(roomID) === 4)
      .forEach(roomID => {

        const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || []);

        clients
          .forEach(clientID => {
          io.to(clientID).emit(ACTIONS.REMOVE_PEER, {
            peerID: socket.id,
          });

          socket.emit(ACTIONS.REMOVE_PEER, {
            peerID: clientID,
          });
        });

        socket.leave(roomID);
      });

    shareRoomsInfo();
  }

  socket.on(ACTIONS.LEAVE, leaveRoom);
  socket.on('disconnecting', leaveRoom);

  socket.on(ACTIONS.RELAY_SDP, ({peerID, sessionDescription}) => {
    io.to(peerID).emit('session-description', {
      peerID: socket.id,
      sessionDescription,
    });
  });

  socket.on(ACTIONS.RELAY_ICE, ({peerID, iceCandidate}) => {
    io.to(peerID).emit('ice-candidate', {
      peerID: socket.id,
      iceCandidate,
    });
  });

});

const publicPath = join(__dirname, 'build');

//app.use(publicPath);

app.get('*', (req, res) => {
  res.sendFile(join(publicPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log('Server Started!')
})