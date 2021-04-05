var express = require('express');
var app = express();
var serv = require('http').Server(app);

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/client/index.html');

});
app.use('/client', express.static(__dirname + '/client'));
serv.listen(2000);

console.log('Server Started.');

var SOCKET_LIST = {};

var Entity = () => {
    var self = {
        x:250,
        y:250,
        spdX:0,
        spdY:0,
        id:''
    }

    self.update = () => {
        self.updatePosition();
    }

    self.updatePosition = () => {
        self.x += self.spdX;
        self.y += self.spdY;
    }

    self.getDistance = (pt) => {
        return Math.sqrt(Math.pow(self.x-pt.x, 2) + Math.pow(self.y-pt.y, 2));
    }

    return self
}

var Player = (id) => {
    var self = Entity();
    self.id = id;
    self.userId = '' + Math.floor(10 * Math.random());
    self.pressingRight = false;
    self.pressingLeft = false;
    self.pressingUp = false;
    self.pressingDown = false;
    self.pressingAttack = false;
    self.mouseAngle = 0;
    self.maxSpd = 10;
    self.score = 0;
    self.color = Math.floor(Math.random()*16777215).toString(16);

    var super_update = self.update;
    self.update = () => {
        self.updateSpd();
        super_update();

        if (self.pressingAttack) {
            self.shootBullet(self.id, self.mouseAngle);
        }
    }

    self.shootBullet = (parent, angle) => {
        var b = Bullet(parent, angle);
        b.x = self.x;
        b.y = self.y;
    }

    self.updateSpd = () => {
        if(self.pressingRight)
            self.spdX = self.maxSpd;
        else if (self.pressingLeft)
            self.spdX = -self.maxSpd;
        else
            self.spdX = 0;
        if (self.pressingUp)
            self.spdY = -self.maxSpd;
        else if (self.pressingDown)
            self.spdY = self.maxSpd;
        else
            self.spdY = 0;
    }

    Player.list[id] = self;

    initPack.player.push({
        id:self.id,
        x:self.x,
        y:self.y,
        color:self.color
    });

    return self
}

Player.list = {};

Player.onConnect = (socket) => {
    var player = Player(socket.id);

    socket.on('keyPress', (data) => {
        if(data.inputId === 'left')
            player.pressingLeft = data.state;
        else if(data.inputId === 'right')
            player.pressingRight = data.state;
        else if(data.inputId === 'up')
            player.pressingUp = data.state;
        else if(data.inputId === 'down')
            player.pressingDown = data.state;  
        else if(data.inputId === 'attack')
            player.pressingAttack = data.state;
        else if(data.inputId === 'mouseAngle')
            player.mouseAngle = data.state;
    });
}

Player.onDisconnect = (socket) => {
    delete Player.list[socket.id];
    removePack.player.push(socket.id);
}

Player.update = () => {
    var pack = [];

    for(var i in Player.list) {
        var player = Player.list[i];
        player.update();
        pack.push({
            id:player.id,
            x:player.x,
            y:player.y
        })
    }
    return pack;
}

var Bullet = (parent, angle) => {
    var self = Entity();
    self.id = Math.random();
    self.spdX = Math.cos(angle/180*Math.PI) * 10;
    self.spdY = Math.sin(angle/180*Math.PI) * 10;

    self.parent = parent;

    self.timer = 0;
    self.toRemove = false;
    var super_update = self.update;
    self.update = () => {
        if (self.timer++ > 100)
            self.toRemove = true;
        super_update();

        for (var i in Player.list) {
            var p = Player.list[i];
            if (self.getDistance(p) < 32 && self.parent !== p.id) {
                //handle collision such as hp--
                self.toRemove = true;
            }
        }
    }

    Bullet.list[self.id] = self;

    initPack.bullet.push({
        id:self.id,
        x:self.x,
        y:self.y
    });

    return self;
}

Bullet.list = {};

Bullet.update = () => {

    var pack = [];

    for(var i in Bullet.list) {
        var bullet = Bullet.list[i];
        bullet.update();

        if(bullet.toRemove){
            delete Bullet.list[i];
            removePack.bullet.push(bullet.id);
        } else {      
            pack.push({
                id:bullet.id,
                x:bullet.x,
                y:bullet.y
            })
        }
    }
    return pack;
}

var io = require('socket.io') (serv,{});
io.sockets.on('connection', (socket) => {
    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;

    Player.onConnect(socket);

    socket.on('disconnect', () => {
        delete SOCKET_LIST[socket.id];
        Player.onDisconnect(socket);
    });

    socket.on('sendMsgToServer', (data) => {
        var playerName = ('' + socket.id).slice(2,7);
        for (var i in SOCKET_LIST) {
            SOCKET_LIST[i].emit('chat', playerName + ': ' + data);
        }
    });

})

var initPack = {player:[], bullet:[]};
var removePack = {player:[], bullet:[]};

setInterval(() => {
    var pack = {
        player:Player.update(),
        bullet:Bullet.update()
    }

    for(var i in SOCKET_LIST) {
        var socket = SOCKET_LIST[i];
        socket.emit('init', initPack);
        socket.emit('update', pack);
        socket.emit('remove', removePack);
    }

    initPack.player = [];
    initPack.player = [];
    removePack.player = [];
    removePack.bulelt = [];

},1000/25)
