(defpackage :messaging-system
  (:use :cl)
  (:export :initialize-messaging-system
           :make-message-service
           :register-transport
           :send-message
           :handle-received-message
           :make-transport
           :transport
           :receive-message
           :transport-message-service
           :make-websocket-transport))

(in-package :messaging-system)

