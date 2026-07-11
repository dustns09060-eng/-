const CACHE='yeowoobang-v33';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
