(defpackage :lagrange.system
  (:use :cl :messaging-system)
  (:export :initialize-lagrange-system))

(in-package :lagrange.system)

(defun initialize-lagrange-system ()
  
  )

(initialize-lagrange-system)

;; Example usage
(let* ((transport (messaging-system:make-websocket-transport))
       (message-service (messaging-system:make-message-service :transport transport)))
  (messaging-system:send-message message-service "Hello, World!")
  (messaging-system:receive-message transport "Hello, back!"))
