(in-package :message-service)

(defclass transport ()
  ((callback
    :initarg :callback
    :accessor :callback)))
    

  
(defgeneric send (message destination)
  (:documentation "")
)    
