<?php

namespace App\Validator\Constraint;

use Symfony\Component\OptionsResolver\Exception\MissingOptionsException;
use Symfony\Component\Validator\Constraint;

class RemoteFileSize extends Constraint
{
  const FILE_NOT_FOUND = 'eeccf604-665c-4654-9a08-855f59c54835';
  const FILE_SIZE_UNKNOWN = '4eb5cb88-a74d-4311-a5e0-d73b08719d82';
  const FILE_SIZE_EXCEEDED = '882a08a1-7931-4350-8a7c-24b4cd13a3a3';

  protected static $errorNames = [
    self::FILE_NOT_FOUND => 'FILE_NOT_FOUND',
    self::FILE_SIZE_UNKNOWN => 'FILE_SIZE_UNKNOWN',
    self::FILE_SIZE_EXCEEDED => 'FILE_SIZE_EXCEEDED'
  ];

  public $offlineMessage = 'Remote file could not be found.';
  public $unknownMessage = 'Remote file size cannot be determined.';
  public $maxMessage = 'Remote file size must be less than {{ limit }} kilobytes.';
  public $max;

  public function __construct($options = null)
  {
    if (null !== $options && !\is_array($options)) {
      $options = [
        'max' => $options,
      ];
    }

    parent::__construct($options);

    if (null === $this->max) {
      throw new MissingOptionsException(sprintf('Option "%s" must be given for constraint %s', __CLASS__, 'max'));
    }
  }
}
