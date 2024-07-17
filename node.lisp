(in-package :lagrange)

;;
;; Node represents a single system node running as the only node on a virtual or
;; physical computer.
;;
;; It creates the system cache.
;; It starts all other services and connects them.
;;
;; The event bus is needed since there otherwise would be a circular dependency 
;; between the system cache and the message service.

(defclass node ()
  ((eventbus
    :initform (make-eventbus)
    :accessor :eventbus)
   (cache :accessor :cache)
   ))
   
(defun make-node ()
  (let 
     ((new-node (make-instance 'node))
      (new-cache (make-system-cache :bus (eventbus new-node))))
     (new-node)))