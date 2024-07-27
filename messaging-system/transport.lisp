

(in-package :messaging-system)

(defclass transport ()
  ((message-service :accessor transport-message-service
                    :initarg :message-service)))

(defmethod send-message ((transport transport) message)
  (format t "Transport Sending message: ~a~%" message)
  ;; Here you would add the actual sending logic
  )

(defmethod receive-message ((transport transport) message)
  (let ((message-service (transport-message-service transport)))
    (when message-service
      (format t "Transport Received message: ~a~%" message)
      ;; Pass the message to the message service
      (messaging-system:handle-received-message message-service message))))

(defun make-transport (&key message-service)
  (let ((transport (make-instance 'transport)))
    (when message-service
      (messaging-system:register-transport message-service transport))
    transport))
