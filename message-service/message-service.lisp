(defpackage #:message-service
  (:use #:cl )
  (:export :message-service))

(in-package :message-service)

(defclass message-service ()
  ((service-callbacks
    :initform (make-hash-table))
   (transport
    :initform nil
    :accessor transport)))
    
(defun make-message-service (transport)
  (make-instance 'message-service :transport transport))