var express = require("express");
var app = express();

app.use(express.static("../ui/dist"))
var http = require("http").createServer(app);
var io = require("socket.io")(http, { cors: { origin: true } });
var Timeout = require("await-timeout");
const { v4: uuidv4 } = require("uuid");

const NUMBER_OF_HORSES = 4;
const BASE_SPEED = 90;
const FINISH_LINE = 10000;
const TIME_BETWEEN_RACE_TICKS = 2000;
const TIME_BETWEEN_ROUNDS = 60000;
const TIME_BETWEEN_PHASES = 10000;
const ONE_SEC = 1000;

var allGames = {};
var playerIdToGameCodeMap = {};

var horse = io.of("/horseRacingDeluxe");

JSON.clone = function (json) {
  return JSON.parse(JSON.stringify(json));
};

function guid() {
  return (
    Math.random().toString(36).substring(2, 5) +
    Math.random().toString(36).substring(2, 5)
  ).toUpperCase();
}

function generateDefaultGame() {
  return {
    players: [],
    inProgress: false,
    gameState: generateDefaultGameState(),
  };
}

function generateDefaultGameState() {
  let horseNames = [
    "Eggsistential Crisis",
    "The Plot Chickens",
    "The Big Peckture",
    "Fowl Play",
    "Stop The Cluck",
    "Yolk's On You",
    "Poultrygeist",
    "Without Feather Ado",
    "The Birds And The Beaks",
    "Doesn't Wing A Bell",
  ];
  let horses = [];
  let usedNameIndexes = [];
  for (let i = 0; i < NUMBER_OF_HORSES; i++) {
    let nameIndex = Math.floor(Math.random() * 10);

    while (usedNameIndexes.includes(nameIndex)) {
      nameIndex = Math.floor(Math.random() * 10);
    }

    usedNameIndexes.push(nameIndex);

    let horse = {
      name: horseNames[nameIndex],
      speed: randomHorseSeed(),
      bets: {},
    };

    horses.push(horse);
  }

  return {
    horses: horses,
    playerState: {},
    race: {},
  };
}

function generateDefaultPlayerState(playerId) {
  return {
    id: playerId,
    totalMoney: 10,
    availablePowerups: {},
    bets: {},
  };
}

function randomHorseSeed() {
  return BASE_SPEED + Math.floor(Math.random() * 10);
}

function generatePlayer(displayName, gameId) {
  return {
    id: uuidv4(),
    displayName,
    gameId,
  };
}

function findGameForCode(gameCode) {
  return allGames[gameCode];
}

function updateGameForGameCode(gameCode, newGameState) {
  allGames[gameCode] = newGameState;
  return newGameState;
}

function findGameForPlayerId(playerId) {
  let gameCode = playerIdToGameCodeMap[playerId];
  return allGames[gameCode];
}

function updateGameForPlayerId(playerId, newGameState) {
  let gameCode = playerIdToGameCodeMap[playerId];
  allGames[gameCode] = newGameState;
  return newGameState;
}

function findGameCodeForPlayerId(playerId) {
  let gameCode = playerIdToGameCodeMap[playerId];
  return gameCode;
}

function generateRaceFromHorses(horses) {
  let race = {};

  for (let _horse in horses) {
    race[horses[_horse].name] = {
      position: 0,
    };
  }
  return race;
}

function findDisplayNameForUserId(userId, playersInGame) {
  let foundPlayer = playersInGame.find(player => {return userId === player.id});
   if(foundPlayer) {
     return foundPlayer.displayName;
   }
   return null;
}

async function runRaceLoop(_gameToEdit, gameCode) {
  let gameToEdit = JSON.clone(_gameToEdit);

  gameToEdit.gameState.phase = "BET";

  horse
    .to(gameCode)
    .emit("update game state", updateGameForGameCode(gameCode, gameToEdit));

  // Start Betting Phase
  for (let timerInSeconds = 5; timerInSeconds >= 0; timerInSeconds--) {
    let newGameToEdit = JSON.clone(findGameForCode(gameCode));
    newGameToEdit.gameState.timer = timerInSeconds;
    horse
      .to(gameCode)
      .emit("update game state", updateGameForGameCode(gameCode, newGameToEdit));
      await Timeout.set(ONE_SEC);
  }
  // End Betting Phase

  function hasAHorseFinished(race) {
    for (let _horse in race) {
      if (race[_horse].position >= FINISH_LINE) {
        return true;
      }
    }
    return false;
  }
  let newGameToEdit = JSON.clone(findGameForCode(gameCode));

  newGameToEdit.gameState.phase = "RACE";
  let race = generateRaceFromHorses(newGameToEdit.gameState.horses);
  newGameToEdit.gameState.race =  race;
  updateGameForGameCode(gameCode, newGameToEdit);
  var activeRace = race;
  await Timeout.set(2000)
  while (!hasAHorseFinished(activeRace)) {
    
    let newGameToEdit = JSON.clone(findGameForCode(gameCode));

    let race = newGameToEdit.gameState.race;
    for (let _chicken in race) {
      let foundChicken = newGameToEdit.gameState.horses.find((chicken) => {
        return chicken.name === _chicken;
      });
      let speed = foundChicken.speed;
      race[_chicken].position +=
        speed * (Math.floor(Math.random() * 10) + 1);
    }
    activeRace = race;
    horse
      .to(gameCode)
      .emit("update game state", updateGameForGameCode(gameCode, newGameToEdit));
      await Timeout.set(TIME_BETWEEN_RACE_TICKS);
  }

  function determineWinnerFromRace(race) {
    let furthestChicken = 0;
    let quickestChicken = "";
    for (let chicken in race) {
      if (race[chicken].position > furthestChicken) {
        quickestChicken = chicken;
        furthestChicken = race[chicken].position;
      }
    }
    return quickestChicken;
  }

  function assignWinningsFromBets(gameState, allPlayerState, winningChicken) {
    let winningPlayers = [];
    let losingPlayers = [];
    let didNotBetPlayers = [];
    for (let playerId in allPlayerState) {

      let didNotBet = true;
      let didWin = false;
      let didLose = false;

      let playerState = allPlayerState[playerId];

      for (let chickenBetOn in playerState.bets) {
        if(chickenBetOn) {
          didNotBet = false;
          didLose = true;
        }
        if (chickenBetOn === winningChicken) {
          playerState.totalMoney += 2 * playerState.bets[chickenBetOn];
          
          didLose = false;
          didWin = true;
          break;
        }

        
      }
      if(didNotBet) {
        didNotBetPlayers.push(findDisplayNameForUserId(playerId, gameState.players));
      }
      else if(didLose) {
        losingPlayers.push(findDisplayNameForUserId(playerId, gameState.players));
      }
      else if(didWin) {
        winningPlayers.push(findDisplayNameForUserId(playerId, gameState.players));
      }
    }

    gameState.gameState.winningPlayers = winningPlayers;
    gameState.gameState.losingPlayers = losingPlayers;
    gameState.gameState.didNotBet = didNotBet;


  }

  newGameToEdit = JSON.clone(findGameForCode(gameCode));
  let winner = determineWinnerFromRace(newGameToEdit.gameState.race);
  assignWinningsFromBets(newGameToEdit, newGameToEdit.gameState.playerState, winner);

  newGameToEdit.gameState.phase = "RESULTS";
  newGameToEdit.gameState.winnerOfRound = winner;

  let finalGameState = updateGameForGameCode(gameCode, newGameToEdit);
  horse.to(gameCode).emit("update game state", finalGameState);

  await Timeout.set(TIME_BETWEEN_PHASES);

  return finalGameState;
}


function resetGameStateForNextRound(gameState) {
  let newGameState = JSON.clone(gameState);
  newGameState.gameState.race = generateRaceFromHorses(newGameState.gameState.horses);
  let playerStates = newGameState.gameState.playerState;
  for(let playerId in playerStates) {
    playerStates[playerId].bets = {};
  }
  return newGameState;
}

horse.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("host joined game", () => {
    let gameCode = guid();
    if (allGames[gameCode] === undefined) {
      allGames[gameCode] = generateDefaultGame();
      socket.join(gameCode);
    }

    socket.emit("game code generated", gameCode);
  });

  socket.on("connect to game", (gameCodeToJoin, username, callback) => {
    socket.join(gameCodeToJoin);
    let game = findGameForCode(gameCodeToJoin);

    if (game) {
      let newPlayer = generatePlayer(username, gameCodeToJoin);
      game.players.push(newPlayer);
      callback(gameCodeToJoin, newPlayer);

      horse.to(gameCodeToJoin).emit("update game state", game);
    } else {
      callback(null);
    }
  });

  socket.on("update bet", (playerId, newBetOptions) => {
    let gameState = findGameForPlayerId(playerId);
    let gameCode = findGameCodeForPlayerId(playerId);
    let newGameToEdit = JSON.clone(gameState);
    let playerState = newGameToEdit.gameState.playerState[playerId];

    if (playerState.bets[newBetOptions.horseName] === undefined) {
      playerState.bets[newBetOptions.horseName] = 0;
    }

    let newTotalMoney = playerState.totalMoney - newBetOptions.difference;
    let newBetTotal =
      playerState.bets[newBetOptions.horseName] + newBetOptions.difference;

    if (newTotalMoney < 0 || newBetTotal < 0) {
      newGameToEdit = gameState;
      horse
        .to(gameCode)
        .emit(
          "update game state",
          updateGameForPlayerId(playerId, newGameToEdit)
        );
      return;
    }

    playerState.bets[newBetOptions.horseName] = newBetTotal;
    playerState.totalMoney = newTotalMoney;
    horse
      .to(gameCode)
      .emit(
        "update game state",
        updateGameForPlayerId(playerId, newGameToEdit)
      );
  });

  socket.on("start game", async (player) => {
    let gameCode = player.gameId;
    let game = findGameForCode(gameCode);
    let gameToEdit = JSON.clone(game);

    gameToEdit.inProgress = true;

    let playerState = {};
    for (let player of gameToEdit.players) {
      playerState[player.id] = generateDefaultPlayerState(player.id);
      playerIdToGameCodeMap[player.id] = gameCode;
    }
    gameToEdit.gameState.playerState = playerState;

    let activeGameState = gameToEdit;
    for (let i = 0; i < 5; i++) {
      let currentGameState = await runRaceLoop(activeGameState, gameCode);
      activeGameState = resetGameStateForNextRound(currentGameState);
    }
  });

  socket.on("disconnect", () => {
    console.log("a user disconnected");
  });
});

http.listen(3000, () => {
  console.log("listening on *:3000");
});
