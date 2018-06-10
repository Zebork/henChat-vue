/**
 * Vuex
 * http://vuex.vuejs.org/zh-cn/intro.html
 */
import Vue from 'vue';
import Vuex from 'vuex';

Vue.use(Vuex);

const WEBSOCKET_SERVER_ADDR = 'wss://us2.srdmobile.tk';
var PVK;
var WS = new WebSocket(WEBSOCKET_SERVER_ADDR);
var sToken;
var PBK;
var addrMap = {};

function randomStr(length, symbol=true) {
    var gen = '';
    if (symbol) {
        var charLib = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`~!@#$%^&*()_-+=|';
    } else {
        var charLib = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    }
    
    for (var i=0; i<length; i++) {
        index = Math.round(Math.random() * (charLib.length - 1));
        gen += charLib[index];
    }
    return gen;
}

WS.onopen = function() {

};
const now = new Date();
const store = new Vuex.Store({
    state: {
        // 当前用户
        user: {
            name: 'henChat',
            img: 'dist/images/1.jpg',
            pbk: "1aa90da332a629946ff05f6531c1be44b7cf03f4"
        },
        // 会话列表
        sessions: [
            {
                id: 1,
                user: {
                    name: '登录助手',
                    img: 'dist/images/2.png',
                    pbk: "5e80adfd77ab98e3cb8e260742aa06b534da59ce",
                },
                messages: [
                    {
                        content: '请输入命令:',
                        date: now
                    },
                    {
                        content: '新用户请输入1',
                        date: now
                    }, 
                    {
                        content: '登录请输入2',
                        date: now
                    },
                    {
                        content: '新建会话请输入3',
                        date: now
                    }
                ]
            }
            // {
            //     id: 2,
            //     user: {
            //         name: 'webpack',
            //         img: 'dist/images/3.jpg',
            //         pbk: "013fbbd652d3a6b1c5c67ce03a1bd1b1303f6710",
            //     },
            //     messages: []
            // }
        ],
        // 当前选中的会话
        currentSessionId: 1,
        // 过滤出只包含这个key的会话
        filterKey: ''
    },
    mutations: {
        INIT_DATA (state) {
            localStorage.clear();
            let data = localStorage.getItem('vue-chat-session');
            if (data) {
                state.sessions = JSON.parse(data);
            }
        },
        // 发送消息
        SEND_MESSAGE ({ sessions, currentSessionId }, content) {
            let session = sessions.find(item => item.id === currentSessionId);
            // console.log(session);
            if(session.id === 1) {
                session.messages.push({
                    content: content,
                    date: new Date(),
                    self: true
                });
                // console.log(content);
                if(content === "1") {
                    var gen = '';
                    let symbol = true;
                    if (symbol) {
                        var charLib = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`~!@#$%^&*()_-+=|';
                    } else {
                        var charLib = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
                    }
                    var length = 64;
                    for (var i=0; i<length; i++) {
                        let index = Math.round(Math.random() * (charLib.length - 1));
                        gen += charLib[index];
                    }
                    PVK = gen;
                    let loginInfo = {
                        type: 'login',
                        msg: "za(gmjMdWERl1S^Ip_Njz|PY4i7t7zY$fZDZ~vnO3skfnhSEGdMdx%WulmhF~tw#",
                        time: now.getTime().toString()
                    }
                    WS.send(JSON.stringify(loginInfo));
                    session.messages.push({
                        content: "PVK: " + PVK,
                        date: new Date(),
                        self: false
                    });
                    // session.messages.push({
                    //     content: "PBK: " + PVK,
                    //     date: new Date(),
                    //     self: false
                    // });

                }
                else if(content === "2") {
                    session.messages.push({
                        content: "请输入PVK",
                        date: new Date(),
                        self: false
                    });
                    // session.messages.push({
                    //     content: "PVK: " + PVK,
                    //     date: new Date(),
                    //     self: false
                    // });
                } 
                else if(content === "3") {
                    if(!PVK) {
                        session.messages.push({
                            content: "请先登录或注册新用户",
                            date: new Date(),
                            self: false
                        });
                    }else {
                        session.messages.push({
                            content: "请输入对方的PBK",
                            date: new Date(),
                            self: false
                        });
                    }
                }
                else {
                    let length = session.messages.length;
                    let last_input;
                    if(session.messages[length - 2].self === true) 
                        last_input = session.messages[length - 2].content;
                    else
                        last_input = session.messages[length - 3].content;
                    console.log(last_input);
                    if(last_input === "2") {
                        PVK = content;
                        let loginInfo = {
                            type: 'login',
                            msg: PVK,
                            time: now.getTime().toString()
                        }
                        WS.send(JSON.stringify(loginInfo));
                        session.messages.push({
                            content: "登陆成功",
                            date: new Date(),
                            self: false
                        });

                    }
                    else if(last_input === "3") {
                        console.log("Hello");
                        let _id = sessions.length + 1;
                        console.log(_id);
                        let new_session = {
                            id: _id,
                            user: {
                                name: 'anonymous',
                                img: 'dist/images/3.jpg',
                                pbk: content,
                            },
                            messages: []
                        }
                        sessions.push(new_session);
                        // currentSessionId = _id;
                    }
                }

            } else {
                let send_to_pbk = session.user.pbk;
                let message_form = { from: PBK,
                to: [ send_to_pbk ],
                type: 'msg',
                msg: content,
                token: sToken,
                time: '1528621485403' };
                WS.send(JSON.stringify(message_form));
                session.messages.push({
                    content: content,
                    date: new Date(),
                    self: true
                });
            }


        },
        RECV_MESSAGE ({sessions, currentSessionId}, content) {
            console.log("true");
        },
        // 选择会话
        SELECT_SESSION (state, id) {
            state.currentSessionId = id;
        } ,
        // 搜索
        SET_FILTER_KEY (state, value) {
            state.filterKey = value;
        }
    }
});

WS.onmessage = function(e) {
        // -- e.data contains received string.
    var getMsg = JSON.parse(e.data);
    if (getMsg.type === 'login') {
        sToken = getMsg.msg;
        PBK = getMsg.to;
        store.state.sessions[0].messages.push({
            content: "PBK:" + PBK,
            date: new Date(),
            self: false
        });

    } else if(getMsg.type === 'msg'){
        if (getMsg.key != 'true') {
            if (addrMap[getMsg.from] != undefined) {
                getMsg.from = addrMap[getMsg.from];
            }
        }
        var to_push = {
            content: getMsg.msg,
            date: new Date(),
            self: false
        }
        var have_session = false;
        var index;
        for(index in store.state.sessions) {
            if(store.state.sessions[index].user.pbk === getMsg.from){
                store.state.sessions[index].messages.push(to_push);
                have_session = true;
                break;
            }
        }
        if( !have_session) {
            let _id = index + 2;
            let to_push_session = {
                id: _id,
                user: {
                    name: 'anonymous',
                    img: 'dist/images/3.jpg',
                    pbk: getMsg.from,
                },
                messages: [ to_push ]
            }
            store.state.sessions.push(to_push_session);
        } else {

        }
    } 
}

store.watch(
    (state) => state.sessions,
    (val) => {
        console.log('CHANGE: ', val);
        localStorage.setItem('vue-chat-session', JSON.stringify(val));
    },
    {
        deep: true
    }
);

export default store;
export const actions = {
    initData: ({ dispatch }) => dispatch('INIT_DATA'),
    sendMessage: ({ dispatch }, content) => dispatch('SEND_MESSAGE', content),
    // recvMessage: ({ dispatch }, content) => dispatch('RECV_MESSAGE', content),
    selectSession: ({ dispatch }, id) => dispatch('SELECT_SESSION', id),
    search: ({ dispatch }, value) => dispatch('SET_FILTER_KEY', value)
};
