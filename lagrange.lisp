(defpackage #:lagrange
  (:use #:cl)
  (:export start-app))

(in-package :lagrange)

(defun start-app ()
  (format t "Hello World~%"))
