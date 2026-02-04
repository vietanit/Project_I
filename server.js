const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Lưu trạng thái phòng
// Cấu trúc: { players: [id1, id2], config: {width, height, bombs}, gameStarted: false }
const rooms = {};

function makeId(length) {
    let result = '';
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Bỏ các ký tự dễ nhầm (I, 1, O, 0)
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

io.on('connection', (socket) => {
    // 1. Tạo phòng với Cấu hình (Level)
    socket.on('create_room', (config) => {
        const roomId = makeId(5);
        rooms[roomId] = {
            players: [socket.id],
            config: config, // Lưu cấu hình (width, height, bombs)
            gameStarted: false
        };
        socket.join(roomId);
        socket.emit('room_created', roomId);
    });

    // 2. Vào phòng
    socket.on('join_room', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length < 2 && !room.gameStarted) {
            room.players.push(socket.id);
            socket.join(roomId);
            
            // Thông báo cho CẢ HAI biết là đã đủ người
            // Gửi kèm cấu hình game cho người mới vào biết
            io.to(roomId).emit('player_joined', room.config);
            
            // Đếm ngược 5s
            let countdown = 5;
            const interval = setInterval(() => {
                io.to(roomId).emit('countdown', countdown);
                countdown--;
                if (countdown < 0) {
                    clearInterval(interval);
                    room.gameStarted = true;
                    // Yêu cầu chủ phòng (người đầu tiên) tạo map
                    io.to(room.players[0]).emit('request_map_generation'); 
                }
            }, 1000);

        } else {
            socket.emit('error_join', 'Phòng không tồn tại hoặc đã đầy!');
        }
    });

    // 3. Đồng bộ Map
    socket.on('send_map_data', ({ roomId, bombIndices }) => {
        // Gửi map cho cả phòng (bao gồm cả host để đảm bảo đồng bộ thời gian bắt đầu)
        io.to(roomId).emit('sync_map', { bombIndices });
    });

    // 4. Cập nhật tiến độ (Progress Bar)
    socket.on('update_progress', ({ roomId, percent }) => {
        // Gửi % của mình cho đối thủ
        socket.to(roomId).emit('opponent_progress', percent);
    });

    // 5. Xử lý thắng thua
    socket.on('i_won', (roomId) => {
        socket.to(roomId).emit('opponent_won');
    });

    // 6. Ngắt kết nối
    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            if (rooms[roomId].players.includes(socket.id)) {
                socket.to(roomId).emit('opponent_left');
                delete rooms[roomId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});