(in-package :message-service)

(defclass websocket-transport (transport)
  ())
  
(defun make-websocket-transport (callback)
  (make-instance 'transport :callback callback))
  
  
