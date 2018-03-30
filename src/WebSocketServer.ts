import * as vscode from 'vscode';
import * as WebSocket from 'ws';

export default class WebSocketServer {
  private server: WebSocket.Server;
  private websocket: WebSocket;

  constructor(onListening: (url: string) => void) {
    this.server = new WebSocket.Server({ port: 0 });

    this.server.on('listening', () => {
      const url = `ws://127.0.0.1:${this.server._server.address().port}`;
      onListening(url);

      this.server.on('connection', (websocket) => {
        this.websocket = websocket;
      });
    });
  }

  public send(code: string) {
    if (this.websocket != undefined) {
      this.websocket.send(code);
    }
  }

  dispose() {
    this.websocket.close();
  }
}
