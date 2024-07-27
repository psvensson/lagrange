
(in-package :messaging-system)

(defclass message-service ()
  ((transport :accessor message-service-transport
              :initarg :transport)))

(defmethod handle-received-message ((service message-service) message)
  (format t "Handling received message: ~a~%" message)
  ;; Handle the incoming message
  )

(defmethod register-transport ((service message-service) transport)
  (setf (message-service-transport service) transport)
  (when (find-class 'messaging-system:transport)
    (setf (messaging-system:transport-message-service transport) service)))

(defmethod send-message ((service message-service) message)
  (let ((transport (message-service-transport service)))
    (when transport
      (messaging-system:send-message transport message))))

(defun make-message-service (&key transport)
  (let ((service (make-instance 'message-service)))
    (when transport
      (register-transport service transport))
    service))
