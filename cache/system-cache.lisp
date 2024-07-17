(defpackage #:system-cache
  (:use #:cl)
  (:import-from #:eventbus #:on)
  (:export :system-cache))

(in-package :system-cache)

(defclass system-cache ()
  ((nodes :initform (make-hash-table) :accessor nodes)
   (tables :initform (make-hash-table))
   (partitions :initform (make-hash-table))
   (latency-zones :initform (make-hash-table))
   (bus :accessor bus)))

(defun make-system-cache (bus)
  (let ((new-system-cache (make-instance 'system-cache :bus bus)))
    ;; Add event bus listeners for external updates from the message service
    (on (bus new-system-cache) 
                 :update-node 
                 (lambda (message)
                   (set-node new-system-cache (car message) (cdr message))))
    ;; TODO: Add the rest of the handlers  10             
    new-system-cache))

(defun make-message (destination data)
  ;; TODO: think about a good message structure
  (cons destination data))

(defmethod set-node ((cache system-cache) key value)
  (setf (gethash key (nodes cache)) value)
  ;; send update event on bus
  )
