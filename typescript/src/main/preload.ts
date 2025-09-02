const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getTodos: () => ipcRenderer.invoke('get-todos'),
  saveTodos: (filePath: string, todos: any[]) => ipcRenderer.invoke('save-todos', filePath, todos),
  deleteTodoFile: (filePath: string) => ipcRenderer.invoke('delete-todo-file', filePath)
});