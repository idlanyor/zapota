import { randomUUID } from 'node:crypto';
import logger from '../../utils/logger.js';

const html = String.raw`
<style>
*{
    box-sizing:border-box;
    -webkit-tap-highlight-color:transparent;
    user-select:none;
}

html,body{
    margin:0;
    padding:0;
    width:100%;
    overflow:hidden;
    background:transparent;
    font-family:Arial,sans-serif;
    touch-action:none;
}

.tttWrap{
    width:100%;
    padding:12px;
    border-radius:16px;
    background:linear-gradient(145deg,#0d1420,#1b2436);
    color:#fff;
    border:1px solid rgba(255,255,255,.12);
}

.tttHeader{
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:8px;
}

.tttTitle{
    font-size:20px;
    font-weight:bold;
}

.tttCreator{
    font-size:9px;
    opacity:.55;
}

.tttModes{
    display:flex;
    justify-content:center;
    gap:8px;
    margin-bottom:10px;
}

.modeBtn{
    flex:1;
    max-width:120px;
    padding:8px 0;
    border:0;
    border-radius:9px;
    background:#232d40;
    color:#9fb0c8;
    font-size:11px;
    font-weight:bold;
    box-shadow:0 3px 0 #131a26;
}

.modeBtn.active{
    background:#22d3ee;
    color:#04222a;
    box-shadow:0 3px 0 #0e7f92;
}

.modeBtn:active{
    transform:scale(.95);
}

.tttInfo{
    display:flex;
    justify-content:center;
    gap:22px;
    margin-bottom:9px;
    font-size:11px;
    font-weight:bold;
}

.tttInfo .you{
    color:#22d3ee;
}

.tttInfo .bot{
    color:#ffb84d;
}

.tttInfo .draw{
    color:#9fb0c8;
}

.tttBoard{
    width:100%;
    max-width:270px;
    margin:auto;
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:8px;
}

.cell{
    aspect-ratio:1;
    border-radius:12px;
    background:#141b28;
    border:1px solid rgba(255,255,255,.08);
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:34px;
    font-weight:bold;
    box-shadow:inset 0 0 10px rgba(0,0,0,.4);
}

.cell.x{
    color:#22d3ee;
}

.cell.o{
    color:#ffb84d;
}

.cell.win{
    background:#173a30;
    border-color:#3ee6a8;
}

.cell:active{
    transform:scale(.94);
}

.status{
    text-align:center;
    font-size:13px;
    font-weight:bold;
    margin:12px 0 6px;
    min-height:16px;
}

.tttBottom{
    text-align:center;
    margin-top:6px;
}

.restartBtn{
    padding:7px 16px;
    border:1px solid rgba(255,255,255,.1);
    border-radius:8px;
    background:#232d40;
    color:#ddd;
    font-size:10px;
    font-weight:bold;
}

.tttHint{
    text-align:center;
    margin-top:7px;
    font-size:8px;
    opacity:.45;
}
</style>

<div class="tttWrap">

    <div class="tttHeader">
        <div class="tttTitle">❌⭕ TIC TAC TOE</div>

        <div class="tttCreator">
            by Naffzx
        </div>
    </div>

    <div class="tttModes">
        <button class="modeBtn active" data-mode="easy">EASY</button>
        <button class="modeBtn" data-mode="hard">HARD</button>
    </div>

    <div class="tttInfo">
        <div>KAMU <span class="you" id="scoreYou">0</span></div>
        <div>BOT <span class="bot" id="scoreBot">0</span></div>
        <div>SERI <span class="draw" id="scoreDraw">0</span></div>
    </div>

    <div class="tttBoard" id="board"></div>

    <p class="status" id="status">Giliranmu, pilih kotak</p>

    <div class="tttBottom">
        <button class="restartBtn" id="restartBtn">
            RESTART
        </button>
    </div>

    <div class="tttHint">
        KAMU = X &nbsp;·&nbsp; BOT = O
    </div>

</div>

<script>
(function(){

const boardEl=document.getElementById("board")
const statusEl=document.getElementById("status")
const restartBtn=document.getElementById("restartBtn")
const modeButtons=document.querySelectorAll(".modeBtn")

const scoreYouEl=document.getElementById("scoreYou")
const scoreBotEl=document.getElementById("scoreBot")
const scoreDrawEl=document.getElementById("scoreDraw")

const wins=[
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
]

let mode="easy"
let board=Array(9).fill(null)
let gameOver=false
let playerTurn=true

let scoreYou=0
let scoreBot=0
let scoreDraw=0

function buildBoard(){

    boardEl.innerHTML=""

    for(let i=0;i<9;i++){

        const cell=document.createElement("div")

        cell.className="cell"
        cell.dataset.index=i

        cell.addEventListener(
            "pointerdown",
            onCellTap
        )

        boardEl.appendChild(cell)

    }

}

function onCellTap(e){

    e.preventDefault()

    const i=Number(this.dataset.index)

    if(gameOver||!playerTurn||board[i]){
        return
    }

    place(i,"X")

    if(checkEnd()){
        return
    }

    playerTurn=false
    statusEl.textContent="Bot berpikir..."

    setTimeout(botMove,450)

}

function place(i,mark){

    board[i]=mark

    const cell=boardEl.children[i]

    cell.textContent=mark
    cell.classList.add(mark==="X"?"x":"o")

}

function checkWinner(b){

    for(const line of wins){

        const [a,c,d]=line

        if(b[a]&&b[a]===b[c]&&b[a]===b[d]){
            return { mark:b[a], line:line }
        }

    }

    return null

}

function checkEnd(){

    const result=checkWinner(board)

    if(result){

        gameOver=true

        result.line.forEach(
            i=>boardEl.children[i].classList.add("win")
        )

        if(result.mark==="X"){

            statusEl.textContent="Kamu menang! 🎉"
            scoreYou++
            scoreYouEl.textContent=String(scoreYou)

        }else{

            statusEl.textContent="Bot menang!"
            scoreBot++
            scoreBotEl.textContent=String(scoreBot)

        }

        playerTurn=false

        return true

    }

    if(board.every(v=>v)){

        gameOver=true
        statusEl.textContent="Seri!"
        scoreDraw++
        scoreDrawEl.textContent=String(scoreDraw)

        return true

    }

    return false

}

function emptyIndices(b){

    return b
        .map((v,i)=>v?null:i)
        .filter(v=>v!==null)

}

function randomMove(b){

    const empties=emptyIndices(b)

    return empties[
        Math.floor(Math.random()*empties.length)
    ]

}

function minimax(b,depth,isMax){

    const result=checkWinner(b)

    if(result){

        if(result.mark==="O"){
            return 10-depth
        }

        return depth-10

    }

    if(b.every(v=>v)){
        return 0
    }

    if(isMax){

        let best=-Infinity

        for(const i of emptyIndices(b)){

            b[i]="O"

            best=Math.max(
                best,
                minimax(b,depth+1,false)
            )

            b[i]=null

        }

        return best

    }else{

        let best=Infinity

        for(const i of emptyIndices(b)){

            b[i]="X"

            best=Math.min(
                best,
                minimax(b,depth+1,true)
            )

            b[i]=null

        }

        return best

    }

}

function bestMove(b){

    let bestScore=-Infinity
    let move=null

    for(const i of emptyIndices(b)){

        b[i]="O"

        const score=minimax(b,0,false)

        b[i]=null

        if(score>bestScore){
            bestScore=score
            move=i
        }

    }

    return move

}

function botMove(){

    if(gameOver){
        return
    }

    const i=
        mode==="hard"
        ? bestMove(board)
        : randomMove(board)

    place(i,"O")

    if(checkEnd()){
        return
    }

    playerTurn=true
    statusEl.textContent="Giliranmu"

}

function newGame(){

    board=Array(9).fill(null)
    gameOver=false
    playerTurn=true

    buildBoard()

    statusEl.textContent="Giliranmu, pilih kotak"

}

modeButtons.forEach(
    btn=>{

        btn.addEventListener(
            "pointerdown",
            function(e){

                e.preventDefault()

                modeButtons.forEach(
                    b=>b.classList.remove("active")
                )

                this.classList.add("active")

                mode=this.dataset.mode

                newGame()

            }
        )

    }
)

restartBtn.addEventListener(
    "pointerdown",
    function(e){

        e.preventDefault()
        newGame()

    }
)

newGame()

})()
</script>
`;

export default {
    name: 'tictactoe2',
    aliases: ['ttt2', 'tic2'],
    description: 'Game Tic Tac Toe interaktif berbasis Meta AI HTML Canvas',
    category: 'Games',
    execute: async (sock, m) => {
        const responseId = randomUUID();

        try {
            await sock.relayMessage(
                m.chat,
                {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2,
                        botMetadata: {
                            messageDisclaimerText: '',
                            botResponseId: responseId,
                        },
                    },
                    botForwardedMessage: {
                        message: {
                            richResponseMessage: {
                                messageType: 1,
                                submessages: [
                                    {
                                        messageType: 2,
                                        messageText: 'Tic Tac Toe Game',
                                    },
                                ],
                                unifiedResponse: {
                                    data: Buffer.from(
                                        JSON.stringify({
                                            response_id: responseId,
                                            sections: [
                                                {
                                                    view_model: {
                                                        primitive: {
                                                            __typename:
                                                                'GenAIaeacdsnwHtmlPrimitive',
                                                            payload: html,
                                                            trusted_sources: [],
                                                        },
                                                        __typename:
                                                            'GenAISingleLayoutViewModel',
                                                    },
                                                },
                                            ],
                                        })
                                    ).toString('base64'),
                                },
                                contextInfo: {
                                    forwardingScore: 1,
                                    isForwarded: true,
                                    forwardedAiBotMessageInfo: {
                                        botJid: '867051314767696@bot',
                                    },
                                    forwardOrigin: 4,
                                },
                            },
                        },
                    },
                },
                {
                    messageId: responseId,
                    raw: true,
                }
            );
        } catch (e) {
            console.error(e);
            m.reply('Gagal memuat game Tic Tac Toe, coba lagi.');
        }
    },
};
