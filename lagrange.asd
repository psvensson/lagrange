(asdf:defsystem #:lagrange
  :description "New System"
  :author "some@one.com"
  :license "BSD"
  :version "0.0.0"
  :serial t
  :entry-point "lagrange:start-app"
  :depends-on ("fiveam" "clack" "websocket-driver" "alexandria" "eventbus")
  :components ((:file "package")
               (:module "messaging-system"
                        :components ((:file "package")
                                     (:file "transport")
                                     (:file "message-service")
                                     (:file "websocket-transport")))
               (:file "system")))
