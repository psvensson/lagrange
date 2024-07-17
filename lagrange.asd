(asdf:defsystem #:lagrange
  :description "New System"
  :author "some@one.com"
  :license  "BSD"
  :version "0.0.0"
  :serial t
  :entry-point "lagrange:start-app"
  :depends-on ("fiveam" "clack" "websocket-driver" "alexandria" "eventbus")
  :components ((:file "lagrange")
               (:file "node")
               (:file "raft-groups/raft-groups")
               (:file "message-service/message-service")
               (:file "message-service/transport")
               (:file "message-service/websocket-transport")
               (:file "cache/system-cache")))
